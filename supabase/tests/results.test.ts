/**
 * 0006_results — entry, submission, approval, publication and correction,
 * tested as SQL with Row Level Security in force. Synthetic athletes only.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import type { CategoryId } from "@/lib/competition/rules/types"
import { generateStartList } from "@/lib/competition/start-list"
import { as, createTestDb, makeClubAdmin, makeFederationAdmin, makeResultsOfficial, refusal, type Db } from "./harness"

let db: Db
let admin: string
let official: string
let ssc: string
let zsc: string
const athletes: string[] = []

async function q<T>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await as(db, user, (tx) => tx.query<T>(sql, params))).rows
}

/** A qualification round with four entered athletes and a published start list. */
async function roundWithStartList(race = "200m"): Promise<string> {
  const [ev] = await q<{ id: string }>(admin, "select public.create_event('2026-2027', 'qualifications', 'e', null, null) as id")
  const [r] = await q<{ id: string }>(
    admin,
    "select public.add_competition_round($1, 1, $2, 'qualification', 'q', 'registration', '{cadet13}', '2026-2027.r1') as id",
    [ev!.id, race]
  )
  const round = r!.id
  await q(admin, "select public.set_round_schedule($1, now() + interval '2 days')", [round])
  await q(admin, "select public.set_round_status($1, 'registration_open')", [round])
  await q(ssc, "select public.submit_race_entries($1, $2::uuid[])", [round, athletes.slice(0, 3)])
  await q(zsc, "select public.submit_race_entries($1, $2::uuid[])", [round, athletes.slice(3)])
  await q(admin, "select public.set_round_status($1, 'registration_closed')", [round])

  const { rows } = await db.query<{ athlete_id: string; federation_number: number; full_name_ar: string; code: string }>(
    `select e.athlete_id, a.federation_number, a.full_name_ar, c.code from public.race_entries e
     join public.athletes a on a.id = e.athlete_id join public.clubs c on c.id = e.club_id where e.round_id = $1`,
    [round]
  )
  const list = generateStartList({
    championship: "qualifications",
    race: race as "200m",
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
  await q(admin, "select public.publish_start_list($1, $2::jsonb)", [round, JSON.stringify(list)])
  return round
}

const lines = (times: (number | null)[], statuses?: string[]) =>
  JSON.stringify(
    athletes.map((id, i) => ({
      athlete_id: id,
      status: statuses?.[i] ?? (times[i] === null ? "dns" : "ok"),
      time_cs: times[i],
      position: null,
    }))
  )

const roundStatus = async (round: string) =>
  (await db.query<{ status: string }>("select status from public.competition_rounds where id = $1", [round])).rows[0]!.status

beforeAll(async () => {
  db = await createTestDb()
  admin = await makeFederationAdmin(db)
  official = await makeResultsOfficial(db)
  ssc = await makeClubAdmin(db, "SSC")
  zsc = await makeClubAdmin(db, "ZSC")
  for (let n = 1; n <= 4; n++) {
    const [row] = await q<{ id: string }>(admin, "select public.federation_add_athlete($1, $2, 'setup') as id", [
      JSON.stringify({ federation_number: 500 + n, full_name_ar: `لاعب ${n}`, name_normalised: `لاعب ${n}`, birth_year: 2014, gender: "M" }),
      n <= 3 ? "SSC" : "ZSC",
    ])
    athletes.push(row!.id)
  }
})

describe("results entry", () => {
  let round: string
  beforeAll(async () => {
    round = await roundWithStartList()
  })

  it("a results official can save results; a club cannot", async () => {
    expect(await refusal(q(ssc, "select public.save_results($1, $2::jsonb)", [round, lines([2000, 2100, 2200, 2300])]))).toMatch(
      /federation staff/
    )
    await q(official, "select public.save_results($1, $2::jsonb)", [round, lines([2000, 2100, 2200, 2300])])
  })

  it("refuses results that leave out or add an athlete", async () => {
    const short = JSON.stringify([{ athlete_id: athletes[0], status: "ok", time_cs: 2000 }])
    expect(await refusal(q(official, "select public.save_results($1, $2::jsonb)", [round, short]))).toMatch(/exactly the 4 athletes/)
  })

  it("refuses a finisher with no time or position, and a non-starter with a time", async () => {
    expect(await refusal(q(official, "select public.save_results($1, $2::jsonb)", [round, lines([2000, 2100, 2200, null], ["ok", "ok", "ok", "ok"])]))).toMatch(
      /check constraint/
    )
    expect(await refusal(q(official, "select public.save_results($1, $2::jsonb)", [round, lines([2000, 2100, 2200, 2300], ["ok", "ok", "ok", "dns"])]))).toMatch(
      /check constraint/
    )
  })

  it("copies names and clubs from the start list, not from the request", async () => {
    const rows = await q<{ full_name_ar: string; club_code: string }>(admin, "select full_name_ar, club_code from public.result_lines order by federation_number")
    expect(rows.map((r) => r.club_code)).toEqual(["SSC", "SSC", "SSC", "ZSC"])
  })

  it("drafts are not public", async () => {
    expect(await q(null, "select * from public.result_lines")).toHaveLength(0)
    expect(await q(ssc, "select * from public.result_lines")).toHaveLength(0)
  })
})

describe("submit, approve, publish", () => {
  let round: string
  beforeAll(async () => {
    round = await roundWithStartList()
    await q(official, "select public.save_results($1, $2::jsonb)", [round, lines([2000, 2100, 2200, 2300])])
  })

  it("submitting moves the round to awaiting approval and freezes the draft", async () => {
    await q(official, "select public.submit_results($1)", [round])
    expect(await roundStatus(round)).toBe("results_submitted")
    expect(await refusal(q(official, "select public.save_results($1, $2::jsonb)", [round, lines([1, 2, 3, 4])]))).toMatch(
      /once the start list is published and before they are submitted/
    )
  })

  it("a results official cannot approve", async () => {
    expect(await refusal(q(official, "select public.approve_results($1)", [round]))).toMatch(/federation admin/)
  })

  it("a federation admin can return results with a reason", async () => {
    expect(await refusal(q(admin, "select public.return_results($1, '')", [round]))).toMatch(/reason/)
    await q(admin, "select public.return_results($1, 'lane 2 time missing a digit')", [round])
    expect(await roundStatus(round)).toBe("start_list_published")
    await q(official, "select public.save_results($1, $2::jsonb)", [round, lines([2000, 2105, 2200, 2300])])
    await q(official, "select public.submit_results($1)", [round])
  })

  it("approval completes the round", async () => {
    await q(admin, "select public.approve_results($1)", [round])
    expect(await roundStatus(round)).toBe("completed")
    expect(await q(null, "select * from public.result_lines")).toHaveLength(0)
  })

  it("publication makes the results — names and clubs, no birth years — public", async () => {
    await q(admin, "select public.publish_results($1)", [round])
    const rows = await q<Record<string, unknown>>(null, "select * from public.result_lines")
    expect(rows).toHaveLength(4)
    expect(Object.keys(rows[0]!)).not.toContain("birth_year")
    expect(await q(null, "select name_ar from public.competition_rounds where id = $1", [round])).toHaveLength(1)
    expect(await q(null, "select * from public.athletes")).toHaveLength(0)
  })
})

describe("correcting approved results", () => {
  let round: string
  let downstream: string

  beforeAll(async () => {
    round = await roundWithStartList("100m")
    await q(official, "select public.save_results($1, $2::jsonb)", [round, lines([1500, 1600, 1700, 1800])])
    await q(official, "select public.submit_results($1)", [round])
    await q(admin, "select public.approve_results($1)", [round])
    const [ev] = await q<{ id: string }>(admin, "select public.create_event('2026-2027', 'national_league', 'nl', null, null) as id")
    const [r] = await q<{ id: string }>(
      admin,
      "select public.add_competition_round($1, 8, '100m', 'r16', 'دور ال 16', 'advancement', '{}', '2026-2027.r1', $2::uuid[]) as id",
      [ev!.id, [round]]
    )
    downstream = r!.id
    await q(admin, "select public.set_round_schedule($1, now() + interval '2 days')", [downstream])
    await q(admin, "select public.set_round_status($1, 'registration_open')", [downstream])
  })

  it("needs a reason and a federation admin", async () => {
    expect(await refusal(q(admin, "select public.correct_results($1, '')", [round]))).toMatch(/reason/)
    expect(await refusal(q(official, "select public.correct_results($1, 'x y z')", [round]))).toMatch(/federation admin/)
  })

  it("keeps the approved version, opens a new draft, and flags rounds that started from it", async () => {
    await q(admin, "select public.correct_results($1, 'timing error in heat 1')", [round])
    const sets = await q<{ version: number; status: string }>(admin, "select version, status from public.result_sets where round_id = $1 order by version", [round])
    expect(sets).toEqual([
      { version: 1, status: "superseded" },
      { version: 2, status: "draft" },
    ])
    expect(await roundStatus(round)).toBe("start_list_published")
    const [d] = await q<{ needs_review: boolean; review_reason: string }>(admin, "select needs_review, review_reason from public.competition_rounds where id = $1", [downstream])
    expect(d!.needs_review).toBe(true)
    expect(d!.review_reason).toMatch(/timing error/)
  })

  it("the review flag clears only after the corrected results are approved again", async () => {
    expect(await refusal(q(admin, "select public.clear_round_review($1, 'checked')", [downstream]))).toMatch(/not approved again/)
    await q(official, "select public.save_results($1, $2::jsonb)", [round, lines([1500, 1650, 1700, 1800])])
    await q(official, "select public.submit_results($1)", [round])
    await q(admin, "select public.approve_results($1)", [round])
    await q(admin, "select public.clear_round_review($1, 'R16 start list re-checked against corrected times')", [downstream])
    const [d] = await q<{ needs_review: boolean }>(admin, "select needs_review from public.competition_rounds where id = $1", [downstream])
    expect(d!.needs_review).toBe(false)
  })

  it("every step is in the audit log", async () => {
    const rows = await q<{ action: string }>(admin, "select action from public.audit_log where target_id = $1 and action like 'results.%' order by id", [round])
    expect(rows.map((r) => r.action)).toEqual([
      "results.save",
      "results.submit",
      "results.approve",
      "results.correct",
      "results.save",
      "results.submit",
      "results.approve",
    ])
  })
})
