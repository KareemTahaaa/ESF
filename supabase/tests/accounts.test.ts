/**
 * 0001_accounts — signup, approval and isolation, tested as SQL.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { as, clubId, createTestDb, makeClubAdmin, makeFederationAdmin, refusal, signUp, type Db } from "./harness"

let db: Db

beforeAll(async () => {
  db = await createTestDb()
})

describe("signup", () => {
  it("creates an inert pending club admin, whatever the metadata claims", async () => {
    const id = await signUp(db, { requestedClub: "SSC" })
    const { rows } = await db.query<{ role: string; status: string; club_id: string | null }>(
      "select role, status, club_id from public.profiles where id = $1",
      [id]
    )
    expect(rows[0]).toEqual({ role: "club_admin", status: "pending", club_id: null })
  })

  it("does not let a user change their own role or status", async () => {
    const id = await signUp(db)
    await as(db, id, (tx) =>
      tx.query("update public.profiles set role = 'federation_admin', status = 'approved' where id = $1", [id])
    )
    const { rows } = await db.query<{ role: string; status: string }>("select role, status from public.profiles where id = $1", [id])
    expect(rows[0]).toEqual({ role: "club_admin", status: "pending" })
  })
})

describe("review_club_account", () => {
  it("refuses a club admin", async () => {
    const club = await makeClubAdmin(db, "SSC")
    const target = await signUp(db)
    const ssc = await clubId(db, "SSC")
    const msg = await refusal(
      as(db, club, (tx) => tx.query("select public.review_club_account($1, 'approve', $2)", [target, ssc]))
    )
    expect(msg).toMatch(/federation admin/)
  })

  it("approves atomically with an audit entry", async () => {
    const admin = await makeFederationAdmin(db)
    const target = await signUp(db, { requestedClub: "ZSC" })
    const zsc = await clubId(db, "ZSC")
    await as(db, admin, (tx) => tx.query("select public.review_club_account($1, 'approve', $2)", [target, zsc]))
    const { rows } = await db.query<{ status: string; club_id: string }>("select status, club_id from public.profiles where id = $1", [target])
    expect(rows[0]).toEqual({ status: "approved", club_id: zsc })
    const audit = await db.query("select 1 from public.audit_log where target_id = $1 and action = 'club_account.approve'", [target])
    expect(audit.rows).toHaveLength(1)
  })
})

describe("profile visibility", () => {
  it("a club admin sees only their own profile", async () => {
    const a = await makeClubAdmin(db, "SSC")
    await makeClubAdmin(db, "ZSC")
    const { rows } = await as(db, a, (tx) => tx.query<{ id: string }>("select id from public.profiles"))
    expect(rows.map((r) => r.id)).toEqual([a])
  })

  it("anon sees no profiles and no audit log", async () => {
    const p = await as(db, null, (tx) => tx.query("select * from public.profiles"))
    expect(p.rows).toHaveLength(0)
    const a = await as(db, null, (tx) => tx.query("select * from public.audit_log"))
    expect(a.rows).toHaveLength(0)
  })
})

describe("function grants (0004)", () => {
  it("signed-out visitors cannot call any security-definer function", async () => {
    const { rows } = await db.query<{ name: string }>(
      `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
       order by 1`
    )
    expect(rows).toEqual([])
  })

  it("signup still creates a profile through the trigger", async () => {
    const id = await signUp(db)
    const { rows } = await db.query("select 1 from public.profiles where id = $1", [id])
    expect(rows).toHaveLength(1)
  })

  it("a signed-in club admin can still read its own data through the helpers", async () => {
    const club = await makeClubAdmin(db, "ZSC")
    const { rows } = await as(db, club, (tx) => tx.query<{ c: string | null }>("select public.current_club_id() as c"))
    expect(rows[0]!.c).toBe(await clubId(db, "ZSC"))
  })
})
