/**
 * Catalogue row -> rounds. Expected structure: docs/rules/RULE_MATRIX.md §7 and §9.
 */

import { describe, expect, it } from "vitest"
import { RACE_CATALOGUE_2026_2027, planRounds } from "../rounds"
import { SEASON_2026_2027 } from "../rules/rulesets/season-2026-2027"

const keys = (n: number) => planRounds(n, SEASON_2026_2027).map((r) => r.roundKey)
const ALL_CATEGORIES = SEASON_2026_2027.categories.map((c) => c.id)

describe("planRounds", () => {
  it("covers all 24 catalogue rows", () => {
    expect(RACE_CATALOGUE_2026_2027).toHaveLength(24)
    for (const row of RACE_CATALOGUE_2026_2027) expect(planRounds(row.number, SEASON_2026_2027).length).toBeGreaterThan(0)
  })

  it("rows 1-5 are registration rounds open to every category, with no prerequisite", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const [round] = planRounds(n, SEASON_2026_2027)
      expect(round).toMatchObject({ roundKey: "qualification", entryMode: "registration", prerequisites: [] })
      expect(round!.eligibleCategories).toEqual(ALL_CATEGORIES)
    }
  })

  it.each([
    [6, ["r16", "level_b"]],
    [7, ["r24", "sf", "level_b"]],
    [8, ["r16", "level_b"]],
    [10, ["final", "level_b"]],
    [11, ["sf", "final"]],
    [13, ["qf", "sf", "final_a", "final_b"]],
    [14, ["sf", "final"]],
    [19, ["r24", "r12", "level_b"]],
    [23, ["qf", "sf", "final_a", "final_b"]],
  ])("row %i holds rounds %j", (n, expected) => {
    expect(keys(n)).toEqual(expected)
  })

  it("a League R16 depends on the Qualifications round of the same race", () => {
    const [r16] = planRounds(8, SEASON_2026_2027)
    expect(r16!.entryMode).toBe("advancement")
    expect(r16!.prerequisites).toEqual([{ championship: "qualifications", race: "100m", roundKey: "qualification" }])
  })

  it("a final depends on the round before it in the same championship", () => {
    const final = planRounds(11, SEASON_2026_2027).find((r) => r.roundKey === "final")!
    expect(final.prerequisites).toEqual([{ championship: "national_league", race: "500m", roundKey: "sf" }])
  })

  it("the Cup keeps its own round name `دور ال 12`, not the League's semi-final", () => {
    const r12 = planRounds(19, SEASON_2026_2027).find((r) => r.roundKey === "r12")!
    expect(r12.nameAr).toBe("دور ال 12")
    expect(planRounds(7, SEASON_2026_2027).find((r) => r.roundKey === "sf")!.nameAr).toBe("نصف النهائي")
  })

  it("the 800/1000m round of 24 is no longer blocked (Q1 answered)", () => {
    expect(planRounds(7, SEASON_2026_2027)[0]!.blockedBy).toBeUndefined()
  })

  it("long-distance rows are direct-entry races for senior, junior and youth (Q11 answered)", () => {
    for (const n of [15, 16, 17, 18]) {
      const [race] = planRounds(n, SEASON_2026_2027)
      expect(race).toMatchObject({ roundKey: "race", entryMode: "registration", prerequisites: [] })
      expect(race!.eligibleCategories).toEqual(["senior", "junior", "youth"])
      expect(race!.flags).toEqual([])
    }
  })

  it("follows the catalogue if the federation excludes ناشئين from long distances (Q11)", () => {
    const [race] = planRounds(15, SEASON_2026_2027, { youthInLongDistance: false })
    expect(race!.eligibleCategories).toEqual(["senior", "junior"])
    expect(race!.flags).toEqual([])
  })

  it("rejects a row that is not in the catalogue", () => {
    expect(() => planRounds(25, SEASON_2026_2027)).toThrow(/does not exist/)
  })
})
