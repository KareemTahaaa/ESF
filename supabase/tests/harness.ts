/**
 * Runs the real SQL migrations in an in-process Postgres (PGlite) so Row Level
 * Security, constraints and the security-definer functions are tested as SQL,
 * not as a mock.
 *
 * `as(db, userId, fn)` runs `fn` inside a transaction as the `authenticated`
 * role with `auth.uid()` = userId — exactly how a signed-in request reaches the
 * database through PostgREST. `userId = null` runs as `anon`.
 */

import { PGlite, type Transaction } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const MIGRATIONS = join(__dirname, "..", "migrations")

export type Db = PGlite
export type Tx = Transaction

export async function createTestDb(): Promise<Db> {
  // Supabase ships pgcrypto; PGlite loads it as an opt-in extension.
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(readFileSync(join(__dirname, "supabase-stub.sql"), "utf8"))
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"))
  }
  return db
}

/** Runs `fn` as a signed-in user (or anon), inside a transaction that commits if `fn` succeeds. */
export async function as<T>(db: Db, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""])
    await tx.exec(userId ? "set local role authenticated" : "set local role anon")
    return fn(tx)
  })
}

let counter = 0

/** Creates an auth user; the signup trigger turns it into a pending club admin. */
export async function signUp(db: Db, opts: { email?: string; requestedClub?: string } = {}): Promise<string> {
  counter += 1
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    opts.email ?? `user${counter}@example.org`,
    { full_name: `Test user ${counter}`, requested_club_code: opts.requestedClub ?? null },
  ])
  return id
}

export async function clubId(db: Db, code: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>("select id from public.clubs where code = $1", [code])
  if (!rows[0]) throw new Error(`No club ${code}`)
  return rows[0].id
}

/** Test setup only: promotes an account directly, as the SQL Editor step in SUPABASE_SETUP.md does. */
export async function makeFederationAdmin(db: Db): Promise<string> {
  const id = await signUp(db)
  await db.query("update public.profiles set role = 'federation_admin', status = 'approved' where id = $1", [id])
  return id
}

export async function makeResultsOfficial(db: Db): Promise<string> {
  const id = await signUp(db)
  await db.query("update public.profiles set role = 'results_official', status = 'approved' where id = $1", [id])
  return id
}

export async function makeClubAdmin(db: Db, code: string): Promise<string> {
  const id = await signUp(db, { requestedClub: code })
  await db.query("update public.profiles set status = 'approved', club_id = $2 where id = $1", [id, await clubId(db, code)])
  return id
}

/** Asserts that a statement is refused, returning the error message. */
export async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
  throw new Error("Expected the database to refuse this, but it succeeded.")
}
