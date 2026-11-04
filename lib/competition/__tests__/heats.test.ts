/**
 * Heat sizing and distribution tests.
 *
 * Every official seeding table transcribed in docs/rules/RULE_MATRIX.md §8 is
 * asserted here individually, by its literal expected values. The serpentine
 * primitive is an implementation convenience; the tables are the requirement,
 * so a future rule change that breaks the pattern must fail a named table test
 * rather than silently follow the formula.
 */

import { describe, expect, it } from "vitest"
import { assignLanes, buildHeatSizes, distributeIntoHeatsOfSize, distributeSerpentine } from "../rules/heats"

describe("buildHeatSizes — balanced heats (Q4 default, legacy BuildHeatSizes)", () => {
  it("splits exact multiples evenly", () => {
    expect(buildHeatSizes(16, 4)).toEqual([4, 4, 4, 4])
    expect(buildHeatSizes(16, 2)).toEqual([2, 2, 2, 2, 2, 2, 2, 2])
    expect(buildHeatSizes(24, 4)).toEqual([4, 4, 4, 4, 4, 4])
  })

  it("avoids a tiny final heat, the documented legacy intent", () => {
    // 10 at 4/heat: 3 heats, balanced 4/3/3 rather than 4/4/2.
    expect(buildHeatSizes(10, 4)).toEqual([4, 3, 3])
    expect(buildHeatSizes(11, 4)).toEqual([4, 4, 3])
    expect(buildHeatSizes(9, 4)).toEqual([3, 3, 3])
    expect(buildHeatSizes(7, 2)).toEqual([2, 2, 2, 1])
  })

  it("never produces a heat more than one athlete larger than another", () => {
    for (let total = 1; total <= 120; total++) {
      for (const perHeat of [1, 2, 3, 4, 6]) {
        const sizes = buildHeatSizes(total, perHeat)
        expect(sizes.reduce((a, b) => a + b, 0), `total ${total}/${perHeat}`).toBe(total)
        expect(Math.max(...sizes) - Math.min(...sizes), `spread ${total}/${perHeat}`).toBeLessThanOrEqual(1)
        // No heat may exceed the configured size.
        expect(Math.max(...sizes)).toBeLessThanOrEqual(perHeat)
      }
    }
  })

  it("handles the 200m case of one athlete per heat", () => {
    expect(buildHeatSizes(12, 1)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  })

  it("returns no heats for an empty field", () => {
    expect(buildHeatSizes(0, 4)).toEqual([])
  })

  it("rejects invalid input rather than guessing", () => {
    expect(() => buildHeatSizes(-1, 4)).toThrow(/Invalid athlete count/)
    expect(() => buildHeatSizes(10, 0)).toThrow(/Invalid heat size/)
    expect(() => buildHeatSizes(10.5, 4)).toThrow(/Invalid athlete count/)
  })
})

describe("official seeding tables — 100m Road (Tables 10 r1 / 12 r1)", () => {
  it("Round of 16: 8 heats of 2, H1=[1,16] through H8=[8,9]", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
    expect(distributeSerpentine(seeds, 8)).toEqual([
      [1, 16],
      [2, 15],
      [3, 14],
      [4, 13],
      [5, 12],
      [6, 11],
      [7, 10],
      [8, 9],
    ])
  })

  it("Round of 16 satisfies the published formula: heat i holds seeds i and 17-i", () => {
    const heats = distributeSerpentine([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 8)
    heats.forEach((heat, index) => {
      const i = index + 1
      expect(heat).toEqual([i, 17 - i])
    })
  })

  it("Round of 8: winners of R16 heats paired 1-8, 2-7, 3-6, 4-5", () => {
    const winners = ["w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8"]
    expect(distributeSerpentine(winners, 4)).toEqual([
      ["w1", "w8"],
      ["w2", "w7"],
      ["w3", "w6"],
      ["w4", "w5"],
    ])
  })

  it("Semi-final: winners of QF heats paired 1-4, 2-3", () => {
    const winners = ["q1", "q2", "q3", "q4"]
    expect(distributeSerpentine(winners, 2)).toEqual([
      ["q1", "q4"],
      ["q2", "q3"],
    ])
  })
})

describe("official seeding tables — One Lap and 500m (Tables 10 r2 / 11 r2 / 12 r2)", () => {
  it("Round of 16: 4 heats of 4, H1=[1,8,9,16]", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
    expect(distributeSerpentine(seeds, 4)).toEqual([
      [1, 8, 9, 16],
      [2, 7, 10, 15],
      [3, 6, 11, 14],
      [4, 5, 12, 13],
    ])
  })

  it("Semi-final: 2 heats of 4, H1=[1stH1, 1stH4, 2ndH1, 2ndH4]", () => {
    // Qualifiers ordered: all heat winners by heat number, then all runners-up.
    const qualifiers = ["1stH1", "1stH2", "1stH3", "1stH4", "2ndH1", "2ndH2", "2ndH3", "2ndH4"]
    expect(distributeSerpentine(qualifiers, 2)).toEqual([
      ["1stH1", "1stH4", "2ndH1", "2ndH4"],
      ["1stH2", "1stH3", "2ndH2", "2ndH3"],
    ])
  })
})

describe("official seeding tables — 800/1000m semi-final (Tables 11 r3 / 12 r3)", () => {
  it("3 heats of 4, H1=[1stH1, 1stH6, timeQ1, timeQ6]", () => {
    // The source header row omits "Heat 3", but three columns of data are given.
    const qualifiers = [
      "1stH1",
      "1stH2",
      "1stH3",
      "1stH4",
      "1stH5",
      "1stH6",
      "timeQ1",
      "timeQ2",
      "timeQ3",
      "timeQ4",
      "timeQ5",
      "timeQ6",
    ]
    expect(distributeSerpentine(qualifiers, 3)).toEqual([
      ["1stH1", "1stH6", "timeQ1", "timeQ6"],
      ["1stH2", "1stH5", "timeQ2", "timeQ5"],
      ["1stH3", "1stH4", "timeQ3", "timeQ4"],
    ])
  })
})

describe("distributeSerpentine — properties", () => {
  it("places every seed exactly once", () => {
    for (const count of [1, 5, 16, 24, 37]) {
      for (const heatCount of [1, 2, 3, 4, 6, 8]) {
        const seeds = Array.from({ length: count }, (_, i) => i + 1)
        const heats = distributeSerpentine(seeds, heatCount)
        expect(heats.flat().sort((a, b) => a - b), `${count} seeds / ${heatCount} heats`).toEqual(seeds)
      }
    }
  })

  it("balances heat sizes to within one athlete", () => {
    const seeds = Array.from({ length: 22 }, (_, i) => i + 1)
    const sizes = distributeSerpentine(seeds, 4).map((h) => h.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
  })

  it("gives the top seeds to different heats", () => {
    // The point of serpentine seeding: the strongest athletes must not meet early.
    const seeds = Array.from({ length: 16 }, (_, i) => i + 1)
    const heats = distributeSerpentine(seeds, 4)
    const topFourHeats = [1, 2, 3, 4].map((seed) => heats.findIndex((h) => h.includes(seed)))
    expect(new Set(topFourHeats).size).toBe(4)
  })

  it("is deterministic — repeated calls give identical output", () => {
    const seeds = Array.from({ length: 16 }, (_, i) => i + 1)
    expect(distributeSerpentine(seeds, 4)).toEqual(distributeSerpentine(seeds, 4))
  })

  it("handles an empty field and a single heat", () => {
    expect(distributeSerpentine([], 4)).toEqual([[], [], [], []])
    expect(distributeSerpentine([1, 2, 3], 1)).toEqual([[1, 2, 3]])
  })

  it("rejects an invalid heat count", () => {
    expect(() => distributeSerpentine([1], 0)).toThrow(/Invalid heat count/)
  })
})

describe("distributeIntoHeatsOfSize — qualification round and level B", () => {
  it("100m qualification: heats of 2", () => {
    const seeds = [1, 2, 3, 4, 5, 6]
    expect(distributeIntoHeatsOfSize(seeds, 2)).toEqual([
      [1, 6],
      [2, 5],
      [3, 4],
    ])
  })

  it("One Lap qualification: heats of 4", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(distributeIntoHeatsOfSize(seeds, 4)).toEqual([
      [1, 4, 5, 8],
      [2, 3, 6, 7],
    ])
  })

  it("200m qualification: heats of one athlete each", () => {
    expect(distributeIntoHeatsOfSize([1, 2, 3], 1)).toEqual([[1], [2], [3]])
  })

  it("balances an awkward field, honouring buildHeatSizes capacities", () => {
    // 10 athletes at 4/heat -> 3 heats sized 4/3/3.
    const heats = distributeIntoHeatsOfSize(Array.from({ length: 10 }, (_, i) => i + 1), 4)
    expect(heats.map((h) => h.length)).toEqual([4, 3, 3])
  })

  it("puts a short heat at the slow end, never leaving the top seed alone", () => {
    // 7 athletes at 2/heat is unavoidably one heat of 1. It must fall at the
    // end of the seeding, not on seed 1, who would otherwise race unopposed.
    const heats = distributeIntoHeatsOfSize([1, 2, 3, 4, 5, 6, 7], 2)
    expect(heats.map((h) => h.length)).toEqual([2, 2, 2, 1])
    expect(heats[0]).toContain(1)
    expect(heats[0]!.length).toBe(2)
    // The lone athlete is one of the slowest seeds.
    expect(heats[3]![0]).toBeGreaterThan(3)
  })

  it("places every seed exactly once for any field and heat size", () => {
    for (let total = 1; total <= 60; total++) {
      for (const perHeat of [1, 2, 3, 4]) {
        const seeds = Array.from({ length: total }, (_, i) => i + 1)
        const heats = distributeIntoHeatsOfSize(seeds, perHeat)
        expect(heats.flat().sort((a, b) => a - b), `${total}/${perHeat}`).toEqual(seeds)
        expect(heats.map((h) => h.length), `${total}/${perHeat}`).toEqual(buildHeatSizes(total, perHeat))
      }
    }
  })

  it("returns no heats for an empty field", () => {
    expect(distributeIntoHeatsOfSize([], 4)).toEqual([])
  })
})

describe("assignLanes", () => {
  it("numbers lanes from 1 in listed order, matching the score sheet", () => {
    expect(assignLanes(["a", "b", "c", "d"])).toEqual([
      { lane: 1, entry: "a" },
      { lane: 2, entry: "b" },
      { lane: 3, entry: "c" },
      { lane: 4, entry: "d" },
    ])
  })

  it("handles a single-athlete heat (200m time trial)", () => {
    expect(assignLanes(["solo"])).toEqual([{ lane: 1, entry: "solo" }])
  })
})
