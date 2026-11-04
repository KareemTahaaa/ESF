/**
 * 0008_advancement_start_lists — publishing the start list of a round whose
 * field comes from an earlier round's approved results, tested as SQL with Row
 * Level Security in force. Synthetic athletes only.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { generateAdvancementStartList } from "@/lib/competition/advancement"
import type { LineStatus } from "@/lib/competition/results"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import type { CategoryId } from "@/lib/competition/rules/types"
import { generateStartList, type StartList } from "@/lib/competition/start-list"
import { as, createTestDb, makeClubAdmin, makeFederationAdmin, makeResultsOfficial, refusal, type Db } from "./harness"

let db: Db
let admin: string
let official: string
let ssc: string
let zsc: string
const athletes: string[] = []
let outsider: string
let qualification: string
let r16: string

async function q<T>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await as(db, user, (tx) => tx.query<T>(sql, params))).rows
}

const roundState = async (round: string) =>
  (await db.query<{ status: string; needs_review: boolean }>("select status, needs_review from public.competition_rounds where id = $1", [round])).rows[0]!

/** Qualification results: athlete i ran 15.00 + i/10 s, unless `times` says otherwise. */
const qualificationLines = (times: number[] = athletes.map((_, i) => 1500 + i * 10)) =>
  JSON.stringify(athletes.map((id, i) => ({ athlete_id: id, status: "ok", time_cs: times[i], position: null })))

async function approveQualification(times?: number[]) {
  await q(official, "select public.save_results($1, $2::jsonb)", [qualification, qualificationLines(times)])
  await q(official, "select public.submit_results($1)", [qualification])
  await q(admin, "select public.approve_results($1)", [qualification])
}

/** What the app does: read the approved results and build the round-of-16 list from them. Runs outside any `as()` transaction. */
async function buildR16(): Promise<StartList> {
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
  return generateAdvancementStartList({
    championship: "national_league",
    race: "100m",
    roundKey: "r16",
    eligibleCategories: [],
    ruleset: SEASON_2026_2027,
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

beforeAll(async () => {
  db = await createTestDb()
  admin = await makeFederationAdmin(db)
  official = await makeResultsOfficial(db)
  ssc = await makeClubAdmin(db, "SSC")
  zsc = await makeClubAdmin(db, "ZSC")
  for (let n = 1; n <= 7; n++) {
    const [row] = await q<{ id: string }>(admin, "select public.federation_add_athlete($1, $2, 'setup') as id", [
      JSON.stringify({ federation_number: 700 + n, full_name_ar: `لاعب ${n}`, name_normalised: `لاعب ${n}`, birth_year: 2014, gender: "M" }),
      n <= 4 ? "SSC" : "ZSC",
    ])
    if (n <= 6) athletes.push(row!.id)
    else outsider = row!.id
  }

  // Qualification round: athletes 1-6 entered, start list published, results approved.
  const [qev] = await q<{ id: string }>(admin, "select public.create_event('2026-2027', 'qualifications', 'q', null, null) as id")
  const [qr] = await q<{ id: string }>(
    admin,
    "select public.add_competition_round($1, 4, '100m', 'qualification', 'جولة التصفيات', 'registration', '{cadet13}', '2026-2027.r1') as id",
    [qev!.id]
  )
  qualification = qr!.id
  await q(admin, "select public.set_round_schedule($1, now() + interval '2 days')", [qualification])
  await q(admin, "select public.set_round_status($1, 'registration_open')", [qualification])
  await q(ssc, "select public.submit_race_entries($1, $2::uuid[])", [qualification, athletes.slice(0, 4)])
  await q(zsc, "select public.submit_race_entries($1, $2::uuid[])", [qualification, athletes.slice(4)])
  await q(admin, "select public.set_round_status($1, 'registration_closed')", [qualification])
  const { rows } = await db.query<{ athlete_id: string; federation_number: number; full_name_ar: string; code: string }>(
    `select e.athlete_id, a.federation_number, a.full_name_ar, c.code from public.race_entries e
     join public.athletes a on a.id = e.athlete_id join public.clubs c on c.id = e.club_id where e.round_id = $1`,
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
  await approveQualification()

  // League round of 16, fed by the qualification.
  const [lev] = await q<{ id: string }>(admin, "select public.create_event('2026-2027', 'national_league', 'nl', null, null) as id")
  const [rr] = await q<{ id: string }>(
    admin,
    "select public.add_competition_round($1, 8, '100m', 'r16', 'دور ال 16', 'advancement', '{}', '2026-2027.r1', $2::uuid[]) as id",
    [lev!.id, [qualification]]
  )
  r16 = rr!.id
  // The first League round is registered for (Q12, 0009): both clubs register all their qualifiers.
  await q(admin, "select public.set_round_schedule($1, now() + interval '2 days')", [r16])
  await q(admin, "select public.set_round_status($1, 'registration_open')", [r16])
  await q(ssc, "select public.submit_race_entries($1, $2::uuid[])", [r16, athletes.slice(0, 4)])
  await q(zsc, "select public.submit_race_entries($1, $2::uuid[])", [r16, athletes.slice(4)])
  await q(admin, "select public.set_round_status($1, 'registration_closed')", [r16])
})

describe("publishing a round fed by approved results", () => {
  it("the round cannot be moved to start_list_published without a list", async () => {
    expect(await refusal(q(admin, "select public.set_round_status($1, 'start_list_published')", [r16]))).toMatch(/start-list screen/)
  })

  it("refuses a list naming results that are not the approved ones", async () => {
    const list = await buildR16()
    const stale = { ...list, sources: [{ roundId: qualification, resultSetId: "00000000-0000-0000-0000-000000000000" }] }
    expect(await refusal(publish(r16, stale))).toMatch(/no longer the approved/)
    expect(await refusal(publish(r16, { ...list, sources: [] }))).toMatch(/no longer the approved/)
  })

  it("refuses an athlete who did not race in the qualification", async () => {
    const list = await buildR16()
    const g = list.groups[0]!
    const h = g.heats[0]!
    const swapped: StartList = {
      ...list,
      groups: [{ ...g, heats: [{ ...h, lanes: [{ ...h.lanes[0]!, entrant: { ...h.lanes[0]!.entrant, athleteId: outsider } }, ...h.lanes.slice(1)] }, ...g.heats.slice(1)] }],
    }
    expect(await refusal(publish(r16, swapped))).toMatch(/did not race in the approved/)
  })

  it("refuses a list the rules engine marked unofficial, and a club admin", async () => {
    const list = await buildR16()
    expect(await refusal(publish(r16, { ...list, official: false, blockers: [{ openQuestion: "Q3", detail: "x" }] }))).toMatch(/Q3/)
    expect(await refusal(q(ssc, "select public.publish_start_list($1, $2::jsonb)", [r16, JSON.stringify(list)]))).toMatch(/federation admin/)
  })

  it("publishes the list built from the approved results, with each athlete's club", async () => {
    const list = await buildR16()
    expect(list.official).toBe(true)
    await publish(r16, list)
    expect((await roundState(r16)).status).toBe("start_list_published")
    const lanes = await q<{ club_code: string; seed: number }>(
      admin,
      `select sl.club_code, sl.seed from public.start_list_lanes sl join public.start_lists s on s.id = sl.start_list_id
       where s.round_id = $1 order by sl.seed`,
      [r16]
    )
    // Fastest qualifier is seed 1: athletes 1-4 are SSC, 5-6 ZSC.
    expect(lanes.map((l) => l.club_code)).toEqual(["SSC", "SSC", "SSC", "SSC", "ZSC", "ZSC"])
  })
})

describe("a correction upstream", () => {
  it("flags the round, blocks re-publishing until the corrected results are approved, then re-publishing clears the flag", async () => {
    const before = await buildR16()
    await q(admin, "select public.correct_results($1, 'athlete 6 time was 14.90')", [qualification])
    expect((await roundState(r16)).needs_review).toBe(true)
    expect(await refusal(publish(r16, before))).toMatch(/not approved/)

    await approveQualification(athletes.map((_, i) => (i === 5 ? 1490 : 1500 + i * 10)))
    expect(await refusal(publish(r16, before))).toMatch(/no longer the approved/)

    const after = await buildR16()
    // The corrected time makes athlete 6 the top seed.
    expect(after.groups[0]!.heats[0]!.lanes[0]!.entrant.athleteId).toBe(athletes[5])
    const [v] = await q<{ v: number }>(admin, "select public.publish_start_list($1, $2::jsonb) as v", [r16, JSON.stringify(after)])
    expect(v!.v).toBe(2)
    expect(await roundState(r16)).toEqual({ status: "start_list_published", needs_review: false })
  })
})

describe("results in a round with no club entries", () => {
  it("are saved with the club from the start list", async () => {
    const lines = JSON.stringify(athletes.map((id, i) => ({ athlete_id: id, status: "ok", time_cs: null, position: (i % 2) + 1 })))
    await q(official, "select public.save_results($1, $2::jsonb)", [r16, lines])
    const rows = await q<{ club_code: string }>(
      admin,
      "select l.club_code from public.result_lines l join public.result_sets s on s.id = l.result_set_id where s.round_id = $1 order by l.federation_number",
      [r16]
    )
    expect(rows.map((r) => r.club_code)).toEqual(["SSC", "SSC", "SSC", "SSC", "ZSC", "ZSC"])
  })

  it("once results exist the start list can no longer be replaced", async () => {
    expect(await refusal(publish(r16, await buildR16()))).toMatch(/can no longer be replaced/)
  })
})
