/**
 * Article 7 eligibility tests. Eligibility is per distance and per category.
 */

import { describe, expect, it } from "vitest"
import {
  checkEligibility,
  eligibleRaces,
  mergedCategoriesFor,
  middleDistanceFor,
  validateAthleteEntries,
  assertRulesetCoversCategories,
} from "../rules/eligibility"
import { SEASON_2026_2027 } from "../rules/rulesets/season-2026-2027"
import type { CategoryId } from "../rules/types"

describe("middleDistanceFor — the 800m/1000m split is by category", () => {
  it.each([
    ["senior", 1000],
    ["junior", 1000],
    ["youth", 1000],
    ["cadet14", 1000],
    ["cadet13", 1000],
    ["cadet12", 1000],
    ["precadet11", 800],
    ["precadet10", 800],
    ["precadet9", 800],
    ["mini8", 800],
  ] as const)("%s skates %im", (category, distance) => {
    expect(middleDistanceFor(category as CategoryId)).toBe(distance)
  })
})

describe("checkEligibility — championships", () => {
  it("lets every category enter the qualification sprints (Table 5)", () => {
    for (const category of ["senior", "cadet14", "mini8"] as const) {
      for (const race of ["100m", "one_lap", "200m", "500m", "middle"] as const) {
        expect(checkEligibility("qualifications", race, category).eligible, `${category}/${race}`).toBe(true)
      }
    }
  })

  it("does not run 200m or 500m in the Egypt Cup (Table 8)", () => {
    const r200 = checkEligibility("egypt_cup", "200m", "senior")
    expect(r200.eligible).toBe(false)
    if (!r200.eligible) expect(r200.reason).toBe("race_not_in_championship")
    expect(checkEligibility("egypt_cup", "500m", "senior").eligible).toBe(false)
  })

  it("resolves the middle distance on an eligible entry", () => {
    const r = checkEligibility("egypt_cup", "middle", "precadet10")
    expect(r.eligible).toBe(true)
    if (r.eligible) expect(r.middleDistance).toBe(800)
  })
})

describe("checkEligibility — long distances (Tables 6-7)", () => {
  it("admits senior and junior", () => {
    expect(checkEligibility("national_league", "points_10000_road", "senior").eligible).toBe(true)
    expect(checkEligibility("national_league", "elimination_10000_track", "junior").eligible).toBe(true)
  })

  it("refuses any cadet category", () => {
    for (const category of ["cadet14", "cadet12", "precadet11", "mini8"] as const) {
      const r = checkEligibility("national_league", "points_5000_track", category)
      expect(r.eligible, category).toBe(false)
      if (!r.eligible) expect(r.reason).toBe("category_below_long_distance_range")
    }
  })

  it("admits youth, with no flag: the federation confirmed it (Q11)", () => {
    const r = checkEligibility("national_league", "points_10000_road", "youth")
    expect(r.eligible).toBe(true)
    if (r.eligible) expect(r.flags).toEqual([])
  })

  it("excludes youth when the federation confirms the catalogue reading", () => {
    expect(
      checkEligibility("national_league", "points_10000_road", "youth", { youthInLongDistance: false }).eligible
    ).toBe(false)
  })

  it("refuses long distances outside the National League", () => {
    expect(checkEligibility("egypt_cup", "points_10000_road", "senior").eligible).toBe(false)
  })
})

describe("checkEligibility — relay", () => {
  it("refuses relay, which has no rule (Q10)", () => {
    const r = checkEligibility("national_league", "relay_3000", "senior")
    expect(r.eligible).toBe(false)
    if (!r.eligible) expect(r.reason).toBe("relay_not_implemented")
  })
})

describe("eligibleRaces", () => {
  it("gives a cadet only the sprint and middle distances in the League", () => {
    expect(eligibleRaces("national_league", "cadet13")).toEqual(["100m", "one_lap", "200m", "500m", "middle"])
  })

  it("gives a senior the long distances too, but never relay", () => {
    const races = eligibleRaces("national_league", "senior")
    expect(races).toContain("points_10000_road")
    expect(races).toContain("elimination_15000_road")
    expect(races).not.toContain("relay_3000")
  })
})

describe("validateAthleteEntries — multiple distinct distances", () => {
  it("accepts several distinct eligible distances", () => {
    expect(validateAthleteEntries("national_league", "cadet14", ["100m", "500m", "middle"]).valid).toBe(true)
  })

  it("rejects the same race entered twice", () => {
    const r = validateAthleteEntries("national_league", "cadet14", ["100m", "100m"])
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors.join(" ")).toMatch(/duplicate entry/)
  })

  it("does not let eligibility in one distance carry over to another", () => {
    const r = validateAthleteEntries("national_league", "cadet14", ["100m", "points_10000_road"])
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors).toHaveLength(1)
  })
})

describe("mergedCategoriesFor — Youth + Junior merge in long distances", () => {
  it("groups youth with junior under the junior name", () => {
    expect(mergedCategoriesFor("points_10000_road", "youth")).toEqual({
      groupCategoryId: "junior",
      mergedWith: ["junior", "youth"],
    })
  })

  it("leaves sprint categories unmerged", () => {
    expect(mergedCategoriesFor("100m", "youth")).toEqual({ groupCategoryId: "youth", mergedWith: ["youth"] })
  })

  it("leaves senior unmerged even in long distances", () => {
    expect(mergedCategoriesFor("points_10000_road", "senior").mergedWith).toEqual(["senior"])
  })
})

describe("ruleset coverage", () => {
  it("the 2026-2027 ruleset covers every category", () => {
    expect(() => assertRulesetCoversCategories(SEASON_2026_2027)).not.toThrow()
  })
})
