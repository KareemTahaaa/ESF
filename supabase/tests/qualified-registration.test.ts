/**
 * 0009_qualified_registration — clubs register qualified athletes for the first
 * League round, and level B takes the registered athletes not placed in level A
 * (federation answer to Q12). Tested as SQL with Row Level Security in force.
 * Synthetic athletes only.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { generateAdvancementStartList } from "@/lib/competition/advancement"
import type { LineStatus } from "@/lib/competition/results"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import type { CategoryId } from "@/lib/competition/rules/types"
import { generateStartList, startListAthleteIds, type StartList } from "@/lib/competition/start-list"
import { as, createTestDb, makeClubAdmin, makeFederationAdmin, makeResultsOfficial, refusal, type Db } from "./harness"

let db: Db
let admin: string
let official: string
let ssc: string
let zsc: string
/** a[1]..a[20]: 1-10 SSC, 11-20 ZSC. Athlete n ran 15.00 + n/10 s in the qualification. */
const a: string[] = []
let outsider: string
let qualification: string
let r16: string
let levelB: string

async function q<T>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await as(db, user, (tx) => tx.query<T>(sql, params))).rows
}

/** What the app does: build a round's list from the approved results and the registrations. Outside any `as()`. */
async function build(roundKey: "r16" | "level_b"): Promise<StartList> {
  const { rows: sets } = await db.query<{ id: string }>(
    "select id from public.result_sets where round_id = $1 and status in ('approved', 'published')",
    [qualification]
  )
  const { rows: lists } = await db.query<{ payload: StartList }>(
    "select payload from public.start_lists where round_id = $1 and superseded_at is null",
    [qualification]
  )
  const { rows: lines } = await db.query<{ athlete_id: string; status: LineStatus; time_cs: number | null; position: number | null }>(
    "select athlete_id, status, time_cs, position from public.result_lines where result_set_id = $1",
    [sets[0]!.id]
  )
  const { rows: entries } = await db.query<{ athlete_id: string }>(
    "select athlete_id from public.race_entries where round_id = $1 and status = 'active'",
    [r16]
  )
  return generateAdvancementStartList({
    championship: "national_league",
    race: "100m",
    roundKey,
    eligibleCategories: [],
    ruleset: SEASON_2026_2027,
    registered: new Set(entries.map((e) => e.athlete_id)),
    source: {
      roundId: qualification,
      resultSetId: sets[0]!.id,
      championship: "qualifications",
      roundKey: "qualification",
      startList: lists[0]!.payload,
      lines: new Map(lines.map((l) => [l.athlete_id, { status: l.status, timeCs: l.time_cs, position: l.position }])),
    },
  })
}

const publish = (round: string, list: StartList) => q(admin, "select public.publish_start_list($1, $2::jsonb)", [round, JSON.stringify(list)])
const status = async (round: string) =>
  (await db.query<{ status: string }>("select status from public.competition_rounds where id = $1", [round])).rows[0]!.status

beforeAll(async () => {
  db = await createTestDb()
  admin = await makeFederationAdmin(db)
  official = await makeResultsOfficial(db)
  ssc = await makeClubAdmin(db, "SSC")
  zsc = await makeClubAdmin(db, "ZSC")
  a.push("")
  for (let n = 1; n <= 21; n++) {
    const [row] = await q<{ id: string }>(admin, "select public.federation_add_athlete($1, $2, 'setup') as id", [
      JSON.stringify({ federation_number: 900 + n, full_name_ar: `لاعب ${n}`, name_normalised: `لاعب ${n}`, birth_year: 2014, gender: "M" }),
      n <= 10 ? "SSC" : "ZSC",
    ])
    if (n <= 20) a.push(row!.id)
    else outsider = row!.id
  }

  // Qualification: athletes 1-20 race; results approved. Athlete 21 does not race.
  const [qev] = await q<{ id: string }>(admin, "select public.create_event('2026-2027', 'qualifications', 'q', null, null) as id")
  const [qr] = await q<{ id: string }>(
    admin,
    "select public.add_competition_round($1, 4, '100m', 'qualification', 'جولة التصفيات', 'registration', '{cadet13}', '2026-2027.r1') as id",
    [qev!.id]
  )
  qualification = qr!.id
  await q(admin, "select public.set_round_schedule($1, now() + interval '2 days')", [qualification])
  await q(admin, "select public.set_round_status($1, 'registration_open')", [qualification])
  await q(ssc, "select public.submit_race_entries($1, $2::uuid[])", [qualification, a.slice(1, 11)])
  await q(zsc, "select public.submit_race_entries($1, $2::uuid[])", [qualification, a.slice(11, 21)])
  await q(admin, "select public.set_round_status($1, 'registration_closed')", [qualification])
  const { rows } = await db.query<{ athlete_id: string; federation_number: number; full_name_ar: string; code: string }>(
    `select e.athlete_id, ath.federation_number, ath.full_name_ar, c.code from public.race_entries e
     join public.athletes ath on ath.id = e.athlete_id join public.clubs c on c.id = e.club_id where e.round_id = $1`,
    [qualification]
  )
  const list = generateStartList({
    championship: "qualifications",
    race: "100m",
    roundKey: "qualification",
    ruleset: SEASON_2026_2027,
    rankings: new Map(),
    entrants: rows.map((e) => ({
      athleteId: e.athlete_id,
      federationNumber: e.federation_number,
      fullName: e.full_name_ar,
      clubCode: e.code,
      clubName: e.code,
      categoryId: "cadet13" as CategoryId,
      gender: "M",
    })),
  })
  await publish(qualification, list)
  const lines = JSON.stringify(a.slice(1).map((id, i) => ({ athlete_id: id, status: "ok", time_cs: 1510 + i * 10, position: null })))
  await q(official, "select public.save_results($1, $2::jsonb)", [qualification, lines])
  await q(official, "select public.submit_results($1)", [qualification])
  await q(admin, "select public.approve_results($1)", [qualification])

  // League 100m: round of 16 and level B, both fed by the qualification.
  const [lev] = await q<{ id: string }>(admin, "select public.create_event('2026-2027', 'national_league', 'nl', null, null) as id")
  const [rr] = await q<{ id: string }>(
    admin,
    "select public.add_competition_round($1, 8, '100m', 'r16', 'دور ال 16', 'advancement', '{}', '2026-2027.r1', $2::uuid[]) as id",
    [lev!.id, [qualification]]
  )
  r16 = rr!.id
  const [rb] = await q<{ id: string }>(
    admin,
    "select public.add_competition_round($1, 8, '100m', 'level_b', 'مستوى التصنيف الثاني (B)', 'advancement', '{}', '2026-2027.r1', $2::uuid[]) as id",
    [lev!.id, [qualification]]
  )
  levelB = rb!.id
})

describe("registering qualified athletes", () => {
  it("the round of 16 opens for registration; level B has no registration of its own", async () => {
    await q(admin, "select public.set_round_schedule($1, now() + interval '2 days')", [r16])
    await q(admin, "select public.set_round_status($1, 'registration_open')", [r16])
    expect(await status(r16)).toBe("registration_open")
    await q(admin, "select public.set_round_schedule($1, now() + interval '2 days')", [levelB])
    expect(await refusal(q(admin, "select public.set_round_status($1, 'registration_open')", [levelB]))).toMatch(/cannot move/)
  })

  it("a club sees only its own athletes who raced in the qualification", async () => {
    const mine = await q<{ id: string }>(ssc, "select public.qualified_club_athletes($1) as id", [r16])
    expect(mine.map((r) => r.id).sort()).toEqual(a.slice(1, 11).sort())
    const theirs = await q<{ id: string }>(zsc, "select public.qualified_club_athletes($1) as id", [r16])
    expect(theirs.map((r) => r.id).sort()).toEqual(a.slice(11, 21).sort())
  })

  it("refuses an athlete who did not race in the qualification, and another club's athlete", async () => {
    expect(await refusal(q(zsc, "select public.submit_race_entries($1, $2::uuid[])", [r16, [outsider]]))).toMatch(/did not race/)
    expect(await refusal(q(ssc, "select public.submit_race_entries($1, $2::uuid[])", [r16, [a[11]]]))).toMatch(/not registered to this club/)
  })

  it("clubs register: SSC all but athlete 2, ZSC all but athlete 17", async () => {
    await q(ssc, "select public.submit_race_entries($1, $2::uuid[])", [r16, a.slice(1, 11).filter((_, i) => i !== 1)])
    await q(zsc, "select public.submit_race_entries($1, $2::uuid[])", [r16, a.slice(11, 21).filter((_, i) => i !== 6)])
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.race_entries where round_id = $1 and status = 'active'", [r16])
    expect(rows[0]!.n).toBe(18)
  })
})

describe("publishing level A and level B", () => {
  it("level B cannot be published while level A registration is open", async () => {
    await q(admin, "select public.set_round_status($1, 'registration_closed')", [levelB])
    expect(await refusal(publish(levelB, await build("level_b")))).toMatch(/Close registration for the level A round/)
  })

  it("level A: the registered qualifiers, with the fastest registered B athlete promoted to fill the 16th place", async () => {
    await q(admin, "select public.set_round_status($1, 'registration_closed')", [r16])
    const list = await build("r16")
    const field = startListAthleteIds(list)
    expect(field).toHaveLength(16)
    expect(field).not.toContain(a[2])
    expect(field).toContain(a[18])
    expect(field).not.toContain(a[17])
    await publish(r16, list)
    expect(await status(r16)).toBe("start_list_published")
  })

  it("refuses a list naming an athlete who raced but was not registered", async () => {
    const list = await build("level_b")
    const g = list.groups[0]!
    const h = g.heats[0]!
    const swapped: StartList = {
      ...list,
      groups: [{ ...g, heats: [{ ...h, lanes: [{ ...h.lanes[0]!, entrant: { ...h.lanes[0]!.entrant, athleteId: a[17]! } }, ...h.lanes.slice(1)] }, ...g.heats.slice(1)] }],
    }
    expect(await refusal(publish(levelB, swapped))).toMatch(/not registered for this race/)
  })

  it("level B: the registered B athletes who were not promoted", async () => {
    const list = await build("level_b")
    expect(startListAthleteIds(list).sort()).toEqual([a[19]!, a[20]!].sort())
    await publish(levelB, list)
    expect(await status(levelB)).toBe("start_list_published")
  })
})
