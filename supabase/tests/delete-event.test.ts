/**
 * 0010_delete_event — deleting an event set up by mistake, tested as SQL with
 * Row Level Security in force. Synthetic athletes only.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { as, createTestDb, makeClubAdmin, makeFederationAdmin, refusal, type Db } from "./harness"

let db: Db
let admin: string
let ssc: string
let athlete: string

async function q<T>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await as(db, user, (tx) => tx.query<T>(sql, params))).rows
}

async function eventWithRound(championship = "qualifications", catalogue = 4, race = "100m"): Promise<{ event: string; round: string }> {
  const [ev] = await q<{ id: string }>(admin, "select public.create_event('2026-2027', $1, 'خطأ', null, null) as id", [championship])
  const [r] = await q<{ id: string }>(
    admin,
    "select public.add_competition_round($1, $2, $3, 'qualification', 'جولة التصفيات', 'registration', '{cadet13}', '2026-2027.r1') as id",
    [ev!.id, catalogue, race]
  )
  return { event: ev!.id, round: r!.id }
}

const exists = async (table: string, id: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where id = $1`, [id])).rows[0]!.n === 1

beforeAll(async () => {
  db = await createTestDb()
  admin = await makeFederationAdmin(db)
  ssc = await makeClubAdmin(db, "SSC")
  const [row] = await q<{ id: string }>(admin, "select public.federation_add_athlete($1, 'SSC', 'setup') as id", [
    JSON.stringify({ federation_number: 801, full_name_ar: "لاعب", name_normalised: "لاعب", birth_year: 2014, gender: "M" }),
  ])
  athlete = row!.id
})

describe("delete_event", () => {
  it("deletes an event nobody has used, with its rounds, and records what was deleted", async () => {
    const { event, round } = await eventWithRound()
    await q(admin, "select public.set_round_schedule($1, now() + interval '2 days')", [round])
    await q(admin, "select public.set_round_status($1, 'registration_open')", [round])
    await q(admin, "select public.delete_event($1, 'test event')", [event])
    expect(await exists("events", event)).toBe(false)
    expect(await exists("competition_rounds", round)).toBe(false)
    const { rows } = await db.query<{ detail: { name: string; reason: string; rounds: unknown[] } }>(
      "select detail from public.audit_log where action = 'event.delete' and target_id = $1",
      [event]
    )
    expect(rows[0]!.detail).toMatchObject({ name: "خطأ", reason: "test event" })
    expect(rows[0]!.detail.rounds).toHaveLength(1)
  })

  it("needs a federation admin and a reason", async () => {
    const { event } = await eventWithRound("qualifications", 2, "500m")
    expect(await refusal(q(ssc, "select public.delete_event($1, 'mistake')", [event]))).toMatch(/federation admin/)
    expect(await refusal(q(admin, "select public.delete_event($1, '')", [event]))).toMatch(/reason/)
    expect(await exists("events", event)).toBe(true)
    await q(admin, "select public.delete_event($1, 'cleanup')", [event])
  })

  it("refuses once a club has entered an athlete, even if the entry was withdrawn", async () => {
    const { event, round } = await eventWithRound("qualifications", 1, "200m")
    await q(admin, "select public.set_round_schedule($1, now() + interval '2 days')", [round])
    await q(admin, "select public.set_round_status($1, 'registration_open')", [round])
    await q(ssc, "select public.submit_race_entries($1, $2::uuid[])", [round, [athlete]])
    const [entry] = await q<{ id: string }>(admin, "select id from public.race_entries where round_id = $1", [round])
    await q(ssc, "select public.withdraw_race_entry($1)", [entry!.id])
    expect(await refusal(q(admin, "select public.delete_event($1, 'mistake')", [event]))).toMatch(/Cancel its races instead/)
    expect(await exists("events", event)).toBe(true)
  })

  it("refuses while a race in another event takes its athletes from it", async () => {
    const { event, round } = await eventWithRound("qualifications", 3, "middle")
    const [lev] = await q<{ id: string }>(admin, "select public.create_event('2026-2027', 'national_league', 'nl', null, null) as id")
    await q(
      admin,
      "select public.add_competition_round($1, 7, 'middle', 'r24', 'دور ال 24', 'advancement', '{}', '2026-2027.r1', $2::uuid[])",
      [lev!.id, [round]]
    )
    expect(await refusal(q(admin, "select public.delete_event($1, 'mistake')", [event]))).toMatch(/another event/)
    // Deleting the dependent event first is fine, and then this one can go.
    await q(admin, "select public.delete_event($1, 'mistake')", [lev!.id])
    await q(admin, "select public.delete_event($1, 'mistake')", [event])
    expect(await exists("events", event)).toBe(false)
  })

  it("cannot be called while signed out", async () => {
    const { event } = await eventWithRound("qualifications", 5, "one_lap")
    expect(await refusal(q(null, "select public.delete_event($1, 'x y z')", [event]))).toMatch(/permission denied|federation admin/)
  })
})
