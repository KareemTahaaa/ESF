/**
 * Article 5 points tests.
 *
 * The points table is transcribed verbatim from Table 3, so every category and
 * every scoring position is asserted against the source values. The minimum
 * participants rule, tie handling, and the blocking behaviour for unresolved
 * rules are covered alongside.
 */

import { describe, expect, it } from "vitest"
import {
  assignPositions,
  calculatePoints,
  calculateRelayPoints,
  mayPublishOfficially,
  pointsForPosition,
} from "../rules/points"
import { SEASON_2026_2027 } from "../rules/rulesets/season-2026-2027"
import type { CategoryId, ResultStatus } from "../rules/types"

const ruleset = SEASON_2026_2027

function entry(athleteId: string, position: number | null, status: ResultStatus = "ok") {
  return { athleteId, position, status }
}

/** Three finishers, so the Article 5 minimum is met in tests that need it. */
function threeFinishers() {
  return [entry("a", 1), entry("b", 2), entry("c", 3)]
}

describe("pointsForPosition — Article 5, Table 3 verbatim", () => {
  // Each row is the official table row for that category, positions 1..8.
  const table: ReadonlyArray<readonly [CategoryId, readonly number[]]> = [
    ["senior", [100, 90, 80, 75, 70, 65, 60, 55]],
    ["junior", [80, 72, 64, 60, 56, 52, 48, 44]],
    ["youth", [60, 54, 48, 44, 41, 38, 35, 32]],
    ["cadet14", [50, 45, 42, 38, 36, 32, 30, 27]],
    ["cadet13", [50, 45, 42, 38, 36, 32, 30, 27]],
    ["cadet12", [50, 45, 42, 38, 36, 32, 30, 27]],
    ["precadet11", [40, 36, 32, 28, 26, 24, 22, 20]],
    ["precadet10", [40, 36, 32, 28, 26, 24, 22, 20]],
    ["precadet9", [40, 36, 32, 28, 26, 24, 22, 20]],
    ["mini8", [40, 36, 32, 28, 26, 24, 22, 20]],
  ]

  it.each(table)("%s scores the official row", (categoryId, expected) => {
    for (let position = 1; position <= 8; position++) {
      expect(pointsForPosition(categoryId as CategoryId, position, ruleset), `position ${position}`).toBe(
        (expected as readonly number[])[position - 1]
      )
    }
  })

  it("awards nothing beyond 8th place", () => {
    for (const categoryId of table.map(([c]) => c as CategoryId)) {
      expect(pointsForPosition(categoryId, 9, ruleset)).toBe(0)
      expect(pointsForPosition(categoryId, 20, ruleset)).toBe(0)
    }
  })

  it("throws rather than silently scoring 0 for an unknown category", () => {
    expect(() => pointsForPosition("bogus" as CategoryId, 1, ruleset)).toThrow(/No points row/)
  })

  it("rejects invalid positions", () => {
    expect(() => pointsForPosition("senior", 0, ruleset)).toThrow(/Invalid finishing position/)
    expect(() => pointsForPosition("senior", -1, ruleset)).toThrow(/Invalid finishing position/)
    expect(() => pointsForPosition("senior", 1.5, ruleset)).toThrow(/Invalid finishing position/)
  })
})

describe("minimum participants — `3 لاعبين أو أكثر`", () => {
  it("awards no points when a category has fewer than 3 athletes", () => {
    // Real case: the 2025-26 `10K Points Road` عمومي-بنات block had 2 athletes.
    const result = calculatePoints("senior", [entry("a", 1), entry("b", 2)], ruleset)
    expect(result.pointsAwarded).toBe(false)
    expect(result.participantCount).toBe(2)
    expect(result.awards.every((a) => a.points === 0)).toBe(true)
    expect(result.awards.every((a) => a.zeroReason === "below_minimum_participants")).toBe(true)
  })

  it("awards no points for a single athlete", () => {
    const result = calculatePoints("senior", [entry("a", 1)], ruleset)
    expect(result.pointsAwarded).toBe(false)
    expect(result.awards[0]!.points).toBe(0)
  })

  it("awards points at exactly 3 athletes", () => {
    const result = calculatePoints("senior", threeFinishers(), ruleset)
    expect(result.pointsAwarded).toBe(true)
    expect(result.participantCount).toBe(3)
    expect(result.awards.map((a) => a.points)).toEqual([100, 90, 80])
  })

  it("does not count non-finishers toward the threshold", () => {
    // 3 entries but only 2 finishers -> below the minimum.
    const result = calculatePoints("senior", [entry("a", 1), entry("b", 2), entry("c", null, "dns")], ruleset)
    expect(result.participantCount).toBe(2)
    expect(result.pointsAwarded).toBe(false)
  })
})

describe("ties — `يتم منح النقاط بالتساوي`", () => {
  it("gives each tied athlete the FULL points of the shared position", () => {
    // Two athletes tied 1st in عمومي: both get 100, not 95 and not 50.
    const result = calculatePoints("senior", [entry("a", 1), entry("b", 1), entry("c", 3)], ruleset)
    const points = new Map(result.awards.map((a) => [a.athleteId, a.points]))
    expect(points.get("a")).toBe(100)
    expect(points.get("b")).toBe(100)
    expect(points.get("c")).toBe(80)
  })

  it("marks tied athletes", () => {
    const result = calculatePoints("senior", [entry("a", 1), entry("b", 1), entry("c", 3)], ruleset)
    const tied = new Map(result.awards.map((a) => [a.athleteId, a.tied]))
    expect(tied.get("a")).toBe(true)
    expect(tied.get("b")).toBe(true)
    expect(tied.get("c")).toBe(false)
  })

  it("a shared position no longer blocks publication (Q6 answered: share, then skip)", () => {
    const result = calculatePoints("senior", [entry("a", 1), entry("b", 1), entry("c", 3)], ruleset)
    expect(mayPublishOfficially(result)).toBe(true)
    expect(result.awards.find((a) => a.athleteId === "a")!.points).toBe(result.awards.find((a) => a.athleteId === "b")!.points)
  })

  it("permits publication when there is no tie and every athlete finished", () => {
    const result = calculatePoints("senior", threeFinishers(), ruleset)
    expect(result.blockers).toHaveLength(0)
    expect(mayPublishOfficially(result)).toBe(true)
  })
})

describe("non-finisher statuses (Q3, Q19 answered: no points)", () => {
  it.each(["dns", "dnf", "dq", "fs"] as const)("%s scores 0 and does not block", (status) => {
    const result = calculatePoints("senior", [entry("a", 1), entry("b", 2), entry("c", 3), entry("d", null, status)], ruleset)
    const d = result.awards.find((a) => a.athleteId === "d")!
    expect(d.points).toBe(0)
    expect(d.zeroReason).toBe("non_finisher_status")
    expect(mayPublishOfficially(result)).toBe(true)
  })

  it.each(["unknown"] as const)("a status with no ruling (%s) scores 0 and blocks", (status) => {
    const result = calculatePoints(
      "senior",
      [entry("a", 1), entry("b", 2), entry("c", 3), entry("d", null, status)],
      ruleset
    )
    const d = result.awards.find((a) => a.athleteId === "d")!
    expect(d.points).toBe(0)
    expect(d.zeroReason).toBe("non_finisher_status")
    expect(mayPublishOfficially(result)).toBe(false)
    expect(result.blockers.map((b) => b.openQuestion)).toContain("Q3")
  })

  it("names the statuses present so an admin can act on the message", () => {
    const result = calculatePoints("senior", [entry("a", 1), entry("b", 2), entry("c", null, "unknown")], ruleset)
    expect(result.blockers.find((b) => b.openQuestion === "Q3")!.detail).toMatch(/unknown/)
  })
})

describe("positions outside the scoring table", () => {
  it("records why an athlete scored 0", () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(`a${i + 1}`, i + 1))
    const result = calculatePoints("mini8", entries, ruleset)
    expect(result.awards[7]!.points).toBe(20) // 8th place
    expect(result.awards[8]!.points).toBe(0) // 9th
    expect(result.awards[8]!.zeroReason).toBe("outside_scoring_positions")
    expect(result.awards[9]!.zeroReason).toBe("outside_scoring_positions")
  })
})

describe("assignPositions", () => {
  it("numbers sequentially when there are no ties", () => {
    const positions = assignPositions([["a"], ["b"], ["c"]], ruleset)
    expect([...positions.entries()]).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ])
  })

  it("consumes positions after a tie by default (Q6 default)", () => {
    // Two tied 1st -> next athlete is 3rd.
    const positions = assignPositions([["a", "b"], ["c"]], ruleset)
    expect(positions.get("a")).toBe(1)
    expect(positions.get("b")).toBe(1)
    expect(positions.get("c")).toBe(3)
  })

  it("does not consume positions when the ruleset setting is flipped", () => {
    // Confirming Q6 the other way is a config change, not a code change.
    const alternate = { ...ruleset, tieConsumesPositions: false }
    const positions = assignPositions([["a", "b"], ["c"]], alternate)
    expect(positions.get("c")).toBe(2)
  })

  it("handles a three-way tie", () => {
    const positions = assignPositions([["a", "b", "c"], ["d"]], ruleset)
    expect(positions.get("a")).toBe(1)
    expect(positions.get("c")).toBe(1)
    expect(positions.get("d")).toBe(4)
  })
})

describe("relay", () => {
  it("refuses to score rather than inventing a rule (Q10)", () => {
    expect(() => calculateRelayPoints()).toThrow(/not implemented/)
    expect(() => calculateRelayPoints()).toThrow(/Q10/)
  })
})

describe("traceability", () => {
  it("records the ruleset version on every calculation", () => {
    const result = calculatePoints("senior", threeFinishers(), ruleset)
    expect(result.rulesetVersion).toBe("2026-2027.r1")
  })
})
