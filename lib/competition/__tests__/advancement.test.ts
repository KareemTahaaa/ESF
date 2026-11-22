/**
 * Start lists built from approved results (League and Cup rounds after the
 * qualification). Checked against the official nested tables in
 * docs/rules/RULE_MATRIX.md §8. Synthetic athletes only.
 */

import { describe, expect, it } from "vitest"
import { generateAdvancementStartList, type PrerequisiteResults, type ResultLineInput } from "../advancement"
import { SEASON_2026_2027 } from "../rules/rulesets/season-2026-2027"
import type { CategoryId, Championship, Gender, RaceCode } from "../rules/types"
import { generateStartList, startListAthleteIds, type StartList, type StartListEntrant } from "../start-list"

function entrant(n: number, categoryId: CategoryId = "senior", gender: Gender = "M"): StartListEntrant {
  return { athleteId: `a${n}`, federationNumber: n, fullName: `لاعب ${n}`, clubCode: "SSC", clubName: "الشمس", categoryId, gender }
}

/** A published qualification list for athletes 1..n (federation number order, nobody ranked). */
function qualificationList(race: RaceCode, n: number, categoryId: CategoryId = "senior", gender: Gender = "M"): StartList {
  return generateStartList({
    championship: "qualifications",
    race,
    roundKey: "qualification",
    ruleset: SEASON_2026_2027,
    rankings: new Map(),
    entrants: Array.from({ length: n }, (_, i) => entrant(i + 1, categoryId, gender)),
  })
}

/** Approved results: athlete aN raced in N seconds (lower number = faster). */
const timedByNumber = (list: StartList): Map<string, ResultLineInput> =>
  new Map(startListAthleteIds(list).map((id) => [id, { status: "ok" as const, timeCs: 1000 + Number(id.slice(1)) * 10, position: null }]))

/** Approved results of a heat round: the athletes listed in `winners` win their heat, the rest come second. */
function placings(list: StartList, winners: readonly string[]): Map<string, ResultLineInput> {
  return new Map(
    startListAthleteIds(list).map((id) => [id, { status: "ok" as const, timeCs: null, position: winners.includes(id) ? 1 : 2 }])
  )
}

const source = (championship: Championship, roundKey: string, startList: StartList, lines: Map<string, ResultLineInput>): PrerequisiteResults => ({
  roundId: `round-${roundKey}`,
  resultSetId: `set-${roundKey}`,
  championship,
  roundKey,
  startList,
  lines,
})

const heatsOf = (list: StartList, group = 0) => list.groups[group]!.heats.map((h) => h.lanes.map((l) => l.entrant.athleteId))

const nl = { championship: "national_league" as const, race: "100m" as const, eligibleCategories: [] as CategoryId[], ruleset: SEASON_2026_2027 }

describe("level A from the qualification round", () => {
  const qualification = qualificationList("100m", 20)
  const lines = timedByNumber(qualification)

  it("takes the 16 fastest into the round of 16, seeded by time: heat i = seeds i and 17-i (Table 10 nested 10>1.1.0)", () => {
    const r16 = generateAdvancementStartList({ ...nl, roundKey: "r16", source: source("qualifications", "qualification", qualification, lines) })
    expect(r16.official).toBe(true)
    expect(startListAthleteIds(r16)).toHaveLength(16)
    expect(heatsOf(r16)).toEqual([
      ["a1", "a16"],
      ["a2", "a15"],
      ["a3", "a14"],
      ["a4", "a13"],
      ["a5", "a12"],
      ["a6", "a11"],
      ["a7", "a10"],
      ["a8", "a9"],
    ])
    expect(r16.groups[0]!.heats[0]!.lanes.map((l) => l.seed)).toEqual([1, 16])
    expect(r16.sources).toEqual([{ roundId: "round-qualification", resultSetId: "set-qualification" }])
  })

  it("sends everyone else to level B, seeded by qualification time, in heats of 2 (RULE_MATRIX §8.1-8.2)", () => {
    const b = generateAdvancementStartList({ ...nl, roundKey: "level_b", source: source("qualifications", "qualification", qualification, lines) })
    // Filled like the qualification heats (heats.ts): seeds 1-4 of B snake across two heats.
    expect(heatsOf(b)).toEqual([
      ["a17", "a20"],
      ["a18", "a19"],
    ])
    expect(b.groups[0]!.heats.flatMap((h) => h.lanes.map((l) => l.seed))).toEqual([1, 4, 2, 3])
  })

  it("does not depend on the order results were typed in", () => {
    const shuffled = new Map([...lines.entries()].reverse())
    const a = generateAdvancementStartList({ ...nl, roundKey: "r16", source: source("qualifications", "qualification", qualification, lines) })
    const b = generateAdvancementStartList({ ...nl, roundKey: "r16", source: source("qualifications", "qualification", qualification, shuffled) })
    expect(b).toEqual(a)
  })

  it("keeps each category × gender in its own event", () => {
    const girls = qualificationList("100m", 3, "junior", "F")
    const mixed: StartList = { ...qualification, groups: [...girls.groups.map((g) => ({ ...g, heats: g.heats.map((h) => ({ ...h, lanes: h.lanes.map((l) => ({ ...l, entrant: { ...l.entrant, athleteId: `g${l.entrant.athleteId}` } })) })) })), ...qualification.groups] }
    const mixedLines = new Map([...lines, ...[1, 2, 3].map((n) => [`ga${n}`, { status: "ok" as const, timeCs: 1500 + n, position: null }] as const)])
    const r16 = generateAdvancementStartList({ ...nl, roundKey: "r16", source: source("qualifications", "qualification", mixed, mixedLines) })
    expect(r16.groups.map((g) => [g.eventNumber, g.categoryId, g.gender])).toEqual([
      [2, "senior", "M"],
      [3, "junior", "F"],
    ])
  })

  it("leaves out categories the round is not open to", () => {
    const r16 = generateAdvancementStartList({
      ...nl,
      eligibleCategories: ["junior"],
      roundKey: "r16",
      source: source("qualifications", "qualification", qualification, lines),
    })
    expect(r16.groups).toHaveLength(0)
  })

  it("the 200m final takes the 12 fastest, one athlete per heat (Table 11 r1)", () => {
    const q = qualificationList("200m", 14)
    const final = generateAdvancementStartList({ ...nl, race: "200m", roundKey: "final", source: source("qualifications", "qualification", q, timedByNumber(q)) })
    expect(heatsOf(final)).toEqual(Array.from({ length: 12 }, (_, i) => [`a${i + 1}`]))
  })
})

describe("later rounds from heat placings", () => {
  const qualification = qualificationList("100m", 16)
  const r16 = generateAdvancementStartList({ ...nl, roundKey: "r16", source: source("qualifications", "qualification", qualification, timedByNumber(qualification)) })
  // The lower seed wins every heat of the round of 16: winners a1..a8.
  const r16Winners = heatsOf(r16).map((h) => h[0]!)

  it("quarter-final: winner H1 v winner H8, H2 v H7 … (nested 10>1.1.1)", () => {
    const qf = generateAdvancementStartList({ ...nl, roundKey: "qf", source: source("national_league", "r16", r16, placings(r16, r16Winners)) })
    expect(heatsOf(qf)).toEqual([
      ["a1", "a8"],
      ["a2", "a7"],
      ["a3", "a6"],
      ["a4", "a5"],
    ])
  })

  it("an upset changes who goes through, not the bracket position", () => {
    const upset = r16Winners.map((w, i) => (i === 0 ? "a16" : w))
    const qf = generateAdvancementStartList({ ...nl, roundKey: "qf", source: source("national_league", "r16", r16, placings(r16, upset)) })
    expect(heatsOf(qf)[0]).toEqual(["a16", "a8"])
  })

  it("100m finals: semi winners race Final A, runners-up Final B (Table 10 r1)", () => {
    const sf: StartList = {
      ...r16,
      roundKey: "sf",
      groups: [{ ...r16.groups[0]!, heats: [r16.groups[0]!.heats[0]!, r16.groups[0]!.heats[1]!].map((h, i) => ({ ...h, heatNumber: i + 1 })) }],
    }
    // sf heat 1 = a1 v a16 (a16 wins), heat 2 = a2 v a15 (a2 wins)
    const lines = placings(sf, ["a16", "a2"])
    const finalA = generateAdvancementStartList({ ...nl, roundKey: "final_a", source: source("national_league", "sf", sf, lines) })
    const finalB = generateAdvancementStartList({ ...nl, roundKey: "final_b", source: source("national_league", "sf", sf, lines) })
    expect(heatsOf(finalA)).toEqual([["a16", "a2"]])
    expect(heatsOf(finalB)).toEqual([["a1", "a15"]])
  })

  it("One Lap semi-final: 1st H1, 1st H4, 2nd H1, 2nd H4 in heat 1 (nested 10>2.1.1)", () => {
    const q = qualificationList("one_lap", 16)
    const lap = { ...nl, race: "one_lap" as const }
    const r16Lap = generateAdvancementStartList({ ...lap, roundKey: "r16", source: source("qualifications", "qualification", q, timedByNumber(q)) })
    expect(heatsOf(r16Lap)).toEqual([
      ["a1", "a8", "a9", "a16"],
      ["a2", "a7", "a10", "a15"],
      ["a3", "a6", "a11", "a14"],
      ["a4", "a5", "a12", "a13"],
    ])
    // Lane order = finishing order in every heat.
    const lines = new Map(
      r16Lap.groups[0]!.heats.flatMap((h) => h.lanes.map((l) => [l.entrant.athleteId, { status: "ok" as const, timeCs: null, position: l.lane }] as const))
    )
    const sf = generateAdvancementStartList({ ...lap, roundKey: "sf", source: source("national_league", "r16", r16Lap, lines) })
    // r16 heat 1 finished a1, a8, a9, a16 and heat 4 a4, a5, a12, a13.
    expect(heatsOf(sf)).toEqual([
      ["a1", "a4", "a8", "a5"],
      ["a2", "a3", "a7", "a6"],
    ])
  })
})

describe("federation answers of 2026-11-03", () => {
  const sorted = (heat: string[]) => [...heat].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))

  it("a DNS/DQ goes to the bottom of the ranking (Q3) and the list stays official", () => {
    const q = qualificationList("100m", 16)
    const lines = timedByNumber(q)
    lines.set("a3", { status: "dns", timeCs: null, position: null })
    const r16 = generateAdvancementStartList({ ...nl, roundKey: "r16", source: source("qualifications", "qualification", q, lines) })
    expect(r16.official).toBe(true)
    // a3 is now seed 16, so it meets seed 1 in heat 1.
    expect(heatsOf(r16)[0]).toEqual(["a1", "a3"])
  })

  it("a tie on the last qualifying place takes both athletes through (Q6)", () => {
    const q = qualificationList("100m", 18)
    const lines = timedByNumber(q)
    lines.set("a17", { status: "ok", timeCs: lines.get("a16")!.timeCs, position: null })
    const r16 = generateAdvancementStartList({ ...nl, roundKey: "r16", source: source("qualifications", "qualification", q, lines) })
    expect(r16.official).toBe(true)
    expect(startListAthleteIds(r16)).toHaveLength(17)
    expect(startListAthleteIds(r16)).not.toContain("a18")
  })

  it("the 800/1000m round of 24 is seeded by time and snaked over 6 heats of 4 (Q1)", () => {
    const q = qualificationList("middle", 32)
    const r24 = generateAdvancementStartList({
      ...nl,
      race: "middle",
      roundKey: "r24",
      source: source("qualifications", "qualification", q, timedByNumber(q)),
    })
    expect(r24.official).toBe(true)
    expect(heatsOf(r24).map(sorted)).toEqual([
      ["a1", "a12", "a13", "a24"],
      ["a2", "a11", "a14", "a23"],
      ["a3", "a10", "a15", "a22"],
      ["a4", "a9", "a16", "a21"],
      ["a5", "a8", "a17", "a20"],
      ["a6", "a7", "a18", "a19"],
    ])
  })
})

describe("registration and promotion from level B (Q12)", () => {
  const q = qualificationList("100m", 22)
  const lines = timedByNumber(q)
  const all = (except: string[]) => new Set(startListAthleteIds(q).filter((id) => !except.includes(id)))
  const build = (roundKey: string, registered: Set<string>) =>
    generateAdvancementStartList({ ...nl, roundKey, registered, source: source("qualifications", "qualification", q, lines) })

  it("fills level A places left by unregistered athletes with the fastest registered level B athletes", () => {
    const registered = all(["a2", "a5"])
    const r16 = build("r16", registered)
    expect(r16.official).toBe(true)
    const field = startListAthleteIds(r16)
    expect(field).toHaveLength(16)
    expect(field).not.toContain("a2")
    expect(field).not.toContain("a5")
    expect(field).toContain("a17")
    expect(field).toContain("a18")
    expect(field).not.toContain("a19")
    // The promoted athletes are the lowest seeds: a18 (seed 16) meets a1.
    expect(heatsOf(r16)[0]).toEqual(["a1", "a18"])
    // Level B runs with the registered B athletes who were not promoted.
    expect(sortedIds(build("level_b", registered))).toEqual(["a19", "a20", "a21", "a22"])
  })

  it("never promotes an athlete whose club did not register them", () => {
    const registered = all(["a2", "a17"])
    expect(startListAthleteIds(build("r16", registered))).toContain("a18")
    expect(startListAthleteIds(build("r16", registered))).not.toContain("a17")
    expect(sortedIds(build("level_b", registered))).toEqual(["a19", "a20", "a21", "a22"])
  })

  it("promotes nobody when every level A athlete registers", () => {
    const registered = all(["a20"])
    expect(sortedIds(build("r16", registered))).toEqual(Array.from({ length: 16 }, (_, i) => `a${i + 1}`))
    expect(sortedIds(build("level_b", registered))).toEqual(["a17", "a18", "a19", "a21", "a22"])
  })

  it("runs short, with the Q5 note, when not enough athletes register at all", () => {
    const registered = new Set(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10"])
    const r16 = build("r16", registered)
    expect(startListAthleteIds(r16)).toHaveLength(10)
    expect(r16.groups[0]!.flags.map((f) => f.openQuestion)).toEqual(["Q5"])
    expect(build("level_b", registered).groups).toEqual([])
  })
})

const sortedIds = (list: StartList) => startListAthleteIds(list).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))

describe("what stops a list being official", () => {
  it("a short field is flagged (Q5) but does not block", () => {
    const q = qualificationList("100m", 10)
    const r16 = generateAdvancementStartList({ ...nl, roundKey: "r16", source: source("qualifications", "qualification", q, timedByNumber(q)) })
    expect(r16.official).toBe(true)
    expect(r16.groups[0]!.flags.map((f) => f.openQuestion)).toEqual(["Q5"])
    expect(heatsOf(r16).filter((h) => h.length === 1)).toHaveLength(6)
  })
})

describe("refuses inputs it cannot trust", () => {
  const q = qualificationList("100m", 16)

  it("a previous round that is not this round's prerequisite", () => {
    expect(() =>
      generateAdvancementStartList({ ...nl, roundKey: "qf", source: source("qualifications", "qualification", q, timedByNumber(q)) })
    ).toThrow(/takes its field from 'r16'/)
  })

  it("an athlete on the previous start list with no approved result", () => {
    const lines = timedByNumber(q)
    lines.delete("a5")
    expect(() => generateAdvancementStartList({ ...nl, roundKey: "r16", source: source("qualifications", "qualification", q, lines) })).toThrow(
      /No approved result/
    )
  })
})
