/**
 * Round structure and advancement tests.
 *
 * Each bracket is checked against its catalogue row and rulebook table: round
 * sequence, heat counts, qualifier counts, and prerequisite chains. The
 * qualifier counts are the figures the race catalogue states explicitly, so
 * they are asserted as literals.
 */

import { describe, expect, it } from "vitest"
import {
  BRACKETS,
  canActivateRound,
  computeAdvancement,
  findBracket,
  findRound,
  generateHeats,
  mayGenerateOfficially,
  validatePrerequisiteGraph,
} from "../rules/progression"
import type { HeatResult, RoundSpec } from "../rules/progression"
import { RuleIncompleteError } from "../rules/types"

function ids(count: number, prefix = "a"): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`)
}

/** Builds heat results where position within each heat follows listed order. */
function resultsFor(heats: readonly (readonly string[])[], times?: ReadonlyMap<string, number>): HeatResult[] {
  const out: HeatResult[] = []
  heats.forEach((heat, heatIndex) => {
    heat.forEach((athleteId, position) => {
      out.push({
        heatNumber: heatIndex + 1,
        athleteId,
        positionInHeat: position + 1,
        timeCentiseconds: times?.get(athleteId) ?? 1000 + heatIndex * 10 + position,
      })
    })
  })
  return out
}

describe("bracket definitions — structure", () => {
  it("defines a bracket for every race the catalogue schedules with rounds", () => {
    const keys = BRACKETS.map((b) => `${b.championship}/${b.race}`)
    expect(keys).toEqual(
      expect.arrayContaining([
        "qualifications/100m",
        "qualifications/one_lap",
        "qualifications/200m",
        "qualifications/500m",
        "qualifications/middle",
        "national_league/100m",
        "national_league/one_lap",
        "national_league/500m",
        "national_league/200m",
        "national_league/middle",
        "egypt_cup/100m",
        "egypt_cup/one_lap",
        "egypt_cup/middle",
      ])
    )
  })

  it("does not invent brackets for races the Cup does not run", () => {
    // Article 7 Table 8: the Cup runs only 100m, One Lap and 1000m/800m.
    expect(() => findBracket("egypt_cup", "500m")).toThrow(/No bracket defined/)
    expect(() => findBracket("egypt_cup", "200m")).toThrow(/No bracket defined/)
  })

  it("does not invent brackets for long-distance or relay races", () => {
    // Mass-start packs with no qualification, and relay has no rule at all.
    expect(() => findBracket("national_league", "points_10000_road")).toThrow(/No bracket defined/)
    expect(() => findBracket("national_league", "relay_3000")).toThrow(/No bracket defined/)
  })

  it("cites a source for every round", () => {
    for (const bracket of BRACKETS) {
      for (const round of [...bracket.rounds, ...(bracket.levelB ? [bracket.levelB] : [])]) {
        expect(round.source, `${bracket.championship}/${bracket.race}/${round.id}`).toMatch(/\.docx/)
      }
    }
  })

  it("has an acyclic, well-formed prerequisite graph for every bracket", () => {
    for (const bracket of BRACKETS) {
      expect(() => validatePrerequisiteGraph(bracket), `${bracket.championship}/${bracket.race}`).not.toThrow()
    }
  })
})

describe("100m Road bracket — catalogue rows 8, 13, 20, 23", () => {
  it("runs R16 -> R8 -> SF -> Final A + Final B", () => {
    const bracket = findBracket("national_league", "100m")
    expect(bracket.rounds.map((r) => r.id)).toEqual(["r16", "qf", "sf", "final_a", "final_b"])
  })

  it("uses 8 heats in R16 and advances the winner only (8 qualifiers)", () => {
    const r16 = findRound("national_league", "100m", "r16")
    expect(r16.heats).toBe(8)
    // Catalogue row 8: `يتأهل المركز الأول لكل heat – (8 متأهلين)`
    expect(r16.advance).toEqual({ kind: "heat_positions", positions: [1] })

    const heats = generateHeats(r16, ids(16))
    expect(heats).toHaveLength(8)
    expect(heats[0]!.athleteIds).toEqual(["a1", "a16"])

    const advancement = computeAdvancement(r16, resultsFor(heats.map((h) => h.athleteIds)))
    expect(advancement.advancing).toHaveLength(8)
  })

  it("narrows 8 -> 4 -> 2 through QF and SF", () => {
    const qf = findRound("national_league", "100m", "qf")
    expect(qf.heats).toBe(4)
    const qfHeats = generateHeats(qf, ids(8, "w"))
    expect(qfHeats[0]!.athleteIds).toEqual(["w1", "w8"])
    expect(computeAdvancement(qf, resultsFor(qfHeats.map((h) => h.athleteIds))).advancing).toHaveLength(4)

    const sf = findRound("national_league", "100m", "sf")
    expect(sf.heats).toBe(2)
    const sfHeats = generateHeats(sf, ids(4, "q"))
    expect(sfHeats[0]!.athleteIds).toEqual(["q1", "q4"])
  })

  it("splits the semi into Final A (1st) and Final B (2nd)", () => {
    const sf = findRound("national_league", "100m", "sf")
    const sfHeats = generateHeats(sf, ids(4, "q"))
    const advancement = computeAdvancement(sf, resultsFor(sfHeats.map((h) => h.athleteIds)))
    // Winners first (Final A), then runners-up (Final B), each by heat number.
    expect(advancement.advancing).toEqual(["q1", "q2", "q4", "q3"])
  })

  it("places Final A and Final B both after the semi, and neither before it", () => {
    expect(findRound("national_league", "100m", "final_a").prerequisites).toEqual(["sf"])
    expect(findRound("national_league", "100m", "final_b").prerequisites).toEqual(["sf"])
  })

  it("is identical for the Egypt Cup (Table 12 r1 matches Table 10 r1)", () => {
    const nl = findBracket("national_league", "100m")
    const cup = findBracket("egypt_cup", "100m")
    expect(cup.rounds.map((r) => ({ id: r.id, heats: r.heats, advance: r.advance }))).toEqual(
      nl.rounds.map((r) => ({ id: r.id, heats: r.heats, advance: r.advance }))
    )
  })
})

describe("One Lap and 500m brackets", () => {
  it.each([
    ["national_league", "one_lap"],
    ["national_league", "500m"],
    ["egypt_cup", "one_lap"],
  ] as const)("%s/%s runs R16 -> SF -> Final", (championship, race) => {
    const bracket = findBracket(championship, race)
    expect(bracket.rounds.map((r) => r.id)).toEqual(["r16", "sf", "final"])
  })

  it("advances 1st and 2nd from 4 heats of 4 (8 qualifiers)", () => {
    // Catalogue rows 6, 9: `يتأهل المركز الأول والثاني لكل heat – (8 متأهلين)`
    const r16 = findRound("national_league", "one_lap", "r16")
    expect(r16.heats).toBe(4)
    expect(r16.advance).toEqual({ kind: "heat_positions", positions: [1, 2] })

    const heats = generateHeats(r16, ids(16))
    expect(heats[0]!.athleteIds).toEqual(["a1", "a8", "a9", "a16"])

    const advancement = computeAdvancement(r16, resultsFor(heats.map((h) => h.athleteIds)))
    expect(advancement.advancing).toHaveLength(8)
    // Winners by heat, then runners-up by heat — the order the SF table assumes.
    expect(advancement.advancing).toEqual(["a1", "a2", "a3", "a4", "a8", "a7", "a6", "a5"])
  })

  it("seeds the semi-final exactly as the official nested table specifies", () => {
    const sf = findRound("national_league", "one_lap", "sf")
    const qualifiers = ["1stH1", "1stH2", "1stH3", "1stH4", "2ndH1", "2ndH2", "2ndH3", "2ndH4"]
    const heats = generateHeats(sf, qualifiers)
    expect(heats[0]!.athleteIds).toEqual(["1stH1", "1stH4", "2ndH1", "2ndH4"])
    expect(heats[1]!.athleteIds).toEqual(["1stH2", "1stH3", "2ndH2", "2ndH3"])
  })

  it("finishes with a single final placing 1st to 4th", () => {
    const final = findRound("national_league", "one_lap", "final")
    expect(final.heats).toBe(1)
    expect(final.advance).toEqual({ kind: "final", places: 4 })
  })
})

describe("200m Track — time trial, catalogue row 10", () => {
  it("has no bracket: a single final of one-athlete heats", () => {
    const bracket = findBracket("national_league", "200m")
    expect(bracket.rounds.map((r) => r.id)).toEqual(["final"])
    const final = bracket.rounds[0]!
    expect(final.heats).toBe("by_field_size")
    expect(final.athletesPerHeat).toBe(1)
  })

  it("produces one heat per athlete", () => {
    const heats = generateHeats(findRound("national_league", "200m", "final"), ids(12))
    expect(heats).toHaveLength(12)
    expect(heats.every((h) => h.athleteIds.length === 1)).toBe(true)
  })

  it("qualifies the best 12 times (catalogue row 1)", () => {
    const qualification = findRound("qualifications", "200m", "qualification")
    expect(qualification.advance).toEqual({ kind: "fastest_times", count: 12 })
  })
})

describe("qualification rounds — catalogue rows 1-5", () => {
  it.each([
    ["100m", 2, 16, 4],
    ["one_lap", 4, 16, 5],
    ["200m", 1, 12, 1],
    ["500m", 4, 16, 2],
  ] as const)("%s: heats of %i, %i qualifiers (row %i)", (race, perHeat, qualifiers, _catalogueRow) => {
    const round = findRound("qualifications", race, "qualification")
    expect(round.athletesPerHeat).toBe(perHeat)
    expect(round.advance).toEqual({ kind: "fastest_times", count: qualifiers })
    expect(round.prerequisites).toEqual([])
  })

  it("800/1000m qualifies heat winners plus best times to 24 (row 3)", () => {
    const round = findRound("qualifications", "middle", "qualification")
    expect(round.athletesPerHeat).toBe(4)
    expect(round.advance).toEqual({ kind: "heat_winners_plus_times", additionalByTime: 0, fillTo: 24 })
  })

  it("800/1000m: heat winners first, then the best remaining times up to 24", () => {
    const round = findRound("qualifications", "middle", "qualification")
    // 8 heats of 4 = 32 athletes: 8 winners + the 16 best other times.
    const heats = Array.from({ length: 8 }, (_, h) => Array.from({ length: 4 }, (_, i) => `h${h + 1}p${i + 1}`))
    const times = new Map(heats.flat().map((id, i) => [id, 10000 + i * 10]))
    const advancement = computeAdvancement(round, resultsFor(heats, times))
    expect(advancement.advancing).toHaveLength(24)
    expect(advancement.advancing.slice(0, 8)).toEqual(heats.map((h) => h[0]))
    expect(advancement.eliminated).toHaveLength(8)
  })

  it("selects the fastest times regardless of heat", () => {
    const round = findRound("qualifications", "100m", "qualification")
    const times = new Map([
      ["slow", 1800],
      ["fastest", 1200],
      ["middling", 1500],
    ])
    const advancement = computeAdvancement(
      { ...round, advance: { kind: "fastest_times", count: 2 } },
      resultsFor([["slow", "fastest"], ["middling"]], times)
    )
    expect(advancement.advancing).toEqual(["fastest", "middling"])
    expect(advancement.eliminated).toEqual(["slow"])
  })
})

describe("800/1000m — round of 24 seeding (Q1, federation answer)", () => {
  it("is no longer blocked and is seeded by time", () => {
    const r24 = findRound("national_league", "middle", "r24")
    expect(r24.blockedBy).toBeUndefined()
    expect(r24.seedByTime).toBe(true)
    expect(mayGenerateOfficially(r24)).toBe(true)
  })

  it("snakes the 24 seeds over 6 heats of 4: heat 1 holds seeds 1, 12, 13 and 24", () => {
    const r24 = findRound("national_league", "middle", "r24")
    const heats = generateHeats(r24, ids(24))
    expect(heats).toHaveLength(6)
    expect(heats.every((h) => h.athleteIds.length === 4)).toBe(true)
    expect(heats[0]!.athleteIds).toEqual(["a1", "a12", "a13", "a24"])
    expect(heats[5]!.athleteIds).toEqual(["a6", "a7", "a18", "a19"])
  })

  it("matches the federation's example: 40 athletes in heats of 4 put 1, 20, 21 and 40 in heat 1", () => {
    const q = findRound("qualifications", "middle", "qualification")
    const heats = generateHeats(q, ids(40))
    expect(heats).toHaveLength(10)
    expect(heats[0]!.athleteIds).toEqual(["a1", "a20", "a21", "a40"])
    expect(heats[9]!.athleteIds).toEqual(["a10", "a11", "a30", "a31"])
  })

  it("still specifies membership: 6 heat winners + 6 best times = 12", () => {
    // Catalogue row 7 states 12; the advancement rule is fully specified even
    // though the within-round seeding is not.
    const r24 = findRound("national_league", "middle", "r24")
    expect(r24.heats).toBe(6)
    expect(r24.advance).toEqual({ kind: "heat_winners_plus_times", additionalByTime: 6 })
  })

  it("computes advancement out of R24 correctly once results exist", () => {
    const r24 = findRound("national_league", "middle", "r24")
    const heats = [
      ["w1", "x1", "y1", "z1"],
      ["w2", "x2", "y2", "z2"],
      ["w3", "x3", "y3", "z3"],
      ["w4", "x4", "y4", "z4"],
      ["w5", "x5", "y5", "z5"],
      ["w6", "x6", "y6", "z6"],
    ]
    // Runners-up are the fastest non-winners, so the 6 time qualifiers are x1..x6.
    const times = new Map<string, number>()
    heats.forEach((heat, h) =>
      heat.forEach((id, p) => times.set(id, 10000 + p * 1000 + h))
    )
    const advancement = computeAdvancement(r24, resultsFor(heats, times))
    expect(advancement.advancing).toHaveLength(12)
    expect(advancement.advancing.slice(0, 6)).toEqual(["w1", "w2", "w3", "w4", "w5", "w6"])
    expect(advancement.advancing.slice(6)).toEqual(["x1", "x2", "x3", "x4", "x5", "x6"])
  })

  it("seeds the semi-final exactly as the official nested table specifies", () => {
    const sf = findRound("national_league", "middle", "sf")
    expect(sf.heats).toBe(3)
    const qualifiers = [
      "1stH1", "1stH2", "1stH3", "1stH4", "1stH5", "1stH6",
      "timeQ1", "timeQ2", "timeQ3", "timeQ4", "timeQ5", "timeQ6",
    ]
    const heats = generateHeats(sf, qualifiers)
    expect(heats[0]!.athleteIds).toEqual(["1stH1", "1stH6", "timeQ1", "timeQ6"])
    expect(heats[1]!.athleteIds).toEqual(["1stH2", "1stH5", "timeQ2", "timeQ5"])
    expect(heats[2]!.athleteIds).toEqual(["1stH3", "1stH4", "timeQ3", "timeQ4"])
  })

  it("advances 3 heat winners + 1 best time = 4 to the final", () => {
    const sf = findRound("national_league", "middle", "sf")
    expect(sf.advance).toEqual({ kind: "heat_winners_plus_times", additionalByTime: 1 })
  })

  it("names the Cup's second round دور ال 12, not a semi-final (catalogue row 19)", () => {
    // The catalogue distinguishes them; the official terminology is preserved.
    const cup = findBracket("egypt_cup", "middle")
    expect(cup.rounds.map((r) => r.id)).toEqual(["r24", "r12", "final"])
    expect(findRound("egypt_cup", "middle", "r12").nameAr).toBe("دور ال 12")
    expect(findRound("national_league", "middle", "sf").nameAr).toBe("نصف النهائي")
  })
})

describe("level B — Article 9 (second)", () => {
  it.each([
    ["national_league", "100m", 2],
    ["national_league", "one_lap", 4],
    ["national_league", "500m", 4],
    ["national_league", "200m", 1],
    ["national_league", "middle", 4],
  ] as const)("%s/%s divides level B into heats of %i", (championship, race, perHeat) => {
    const bracket = findBracket(championship, race)
    expect(bracket.levelB?.athletesPerHeat).toBe(perHeat)
  })

  it("is a single round that depends only on the qualification round", () => {
    const levelB = findRound("national_league", "100m", "level_b")
    expect(levelB.prerequisites).toEqual(["qualification"])
  })

  it("generates level B heats without being blocked, even for 800/1000m", () => {
    // Only the level A round of 24 has an underivable seeding; level B is
    // simply "heats of 4 by qualification rank" and is fully specified.
    const levelB = findRound("national_league", "middle", "level_b")
    expect(mayGenerateOfficially(levelB)).toBe(true)
    expect(generateHeats(levelB, ids(10))).toHaveLength(3)
  })
})

describe("canActivateRound — prerequisite enforcement", () => {
  const final = findRound("national_league", "one_lap", "final")

  it("blocks a final while its semi is unapproved", () => {
    const result = canActivateRound(final, ["qualification", "r16"])
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.missing).toEqual(["sf"])
  })

  it("names the specific missing round so the message is actionable", () => {
    const result = canActivateRound(final, [])
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.missing).toContain("sf")
  })

  it("allows activation once the prerequisite is approved", () => {
    expect(canActivateRound(final, ["qualification", "r16", "sf"]).allowed).toBe(true)
  })

  it("allows a first round with no prerequisites", () => {
    const qualification = findRound("qualifications", "100m", "qualification")
    expect(canActivateRound(qualification, []).allowed).toBe(true)
  })

  it("blocks the whole 100m chain from the start", () => {
    expect(canActivateRound(findRound("national_league", "100m", "r16"), []).allowed).toBe(false)
    expect(canActivateRound(findRound("national_league", "100m", "qf"), ["qualification"]).allowed).toBe(false)
  })
})

describe("validatePrerequisiteGraph", () => {
  it("rejects a cycle", () => {
    const cyclic = {
      championship: "national_league" as const,
      race: "100m" as const,
      rounds: [
        { id: "a", nameAr: "a", heats: 1, advance: { kind: "final", places: 1 }, prerequisites: ["b"], source: "x.docx" },
        { id: "b", nameAr: "b", heats: 1, advance: { kind: "final", places: 1 }, prerequisites: ["a"], source: "x.docx" },
      ] as readonly RoundSpec[],
    }
    expect(() => validatePrerequisiteGraph(cyclic)).toThrow(/cycle/)
  })

  it("rejects a reference to an unknown round", () => {
    const dangling = {
      championship: "national_league" as const,
      race: "100m" as const,
      rounds: [
        {
          id: "a",
          nameAr: "a",
          heats: 1,
          advance: { kind: "final", places: 1 },
          prerequisites: ["nonexistent"],
          source: "x.docx",
        },
      ] as readonly RoundSpec[],
    }
    expect(() => validatePrerequisiteGraph(dangling)).toThrow(/unknown round/)
  })
})

describe("generateHeats — edge cases", () => {
  it("returns no heats for an empty field", () => {
    expect(generateHeats(findRound("national_league", "one_lap", "r16"), [])).toEqual([])
  })

  it("drops empty heats when the field is smaller than the heat count", () => {
    // 3 athletes into a nominal 8-heat R16 gives 3 heats of 1, not 8 with gaps.
    const heats = generateHeats(findRound("national_league", "100m", "r16"), ids(3))
    expect(heats).toHaveLength(3)
    expect(heats.map((h) => h.heatNumber)).toEqual([1, 2, 3])
  })

  it("is deterministic", () => {
    const round = findRound("national_league", "one_lap", "r16")
    expect(generateHeats(round, ids(16))).toEqual(generateHeats(round, ids(16)))
  })
})

describe("computeAdvancement — non-finishers", () => {
  it("never promotes a non-finisher ahead of a finisher on time", () => {
    const round = findRound("qualifications", "100m", "qualification")
    const results: HeatResult[] = [
      { heatNumber: 1, athleteId: "dnf", positionInHeat: 2, timeCentiseconds: null },
      { heatNumber: 1, athleteId: "slow", positionInHeat: 1, timeCentiseconds: 2000 },
    ]
    const advancement = computeAdvancement({ ...round, advance: { kind: "fastest_times", count: 1 } }, results)
    expect(advancement.advancing).toEqual(["slow"])
  })

  it("orders non-finishers deterministically among themselves", () => {
    const round = findRound("qualifications", "100m", "qualification")
    const results: HeatResult[] = [
      { heatNumber: 2, athleteId: "b", positionInHeat: 1, timeCentiseconds: null },
      { heatNumber: 1, athleteId: "a", positionInHeat: 1, timeCentiseconds: null },
    ]
    const advancement = computeAdvancement({ ...round, advance: { kind: "fastest_times", count: 2 } }, results)
    expect(advancement.advancing).toEqual(["a", "b"])
  })
})

describe("generateHeats — size-driven rounds follow the Q4 remainder rule", () => {
  it("10 athletes at 4 per heat: heats of 4, 3, 3 with the short heats at the slow end", () => {
    const round = findRound("qualifications", "500m", "qualification")
    const heats = generateHeats(round, Array.from({ length: 10 }, (_, i) => `s${i + 1}`))
    expect(heats.map((h) => h.athleteIds.length)).toEqual([4, 3, 3])
    expect(heats[0]!.athleteIds[0]).toBe("s1")
  })
})
