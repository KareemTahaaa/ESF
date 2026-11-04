/**
 * Seeding tests — Article 9 (first), Table 9.
 *
 * The determinism tests matter as much as the ordering ones: the legacy macro
 * shuffled athletes randomly, and the whole point of this module is that a
 * published start list can be regenerated identically and defended.
 */

import { describe, expect, it } from "vitest"
import {
  LEVEL_A_SIZE,
  maySeedOfficially,
  seedFromPreviousSeason,
  splitClassificationLevels,
} from "../rules/seeding"
import type { SeedingCandidate } from "../rules/seeding"

function candidate(
  athleteId: string,
  federationNumber: number,
  previousRank: number | null,
  extra: Partial<SeedingCandidate> = {}
): SeedingCandidate {
  return { athleteId, federationNumber, previousRank, ...extra }
}

describe("seedFromPreviousSeason — ranked athletes", () => {
  it("orders ranked athletes by previous-season rank, best first", () => {
    const result = seedFromPreviousSeason("100m", [
      candidate("c", 300, 3),
      candidate("a", 100, 1),
      candidate("b", 200, 2),
    ])
    expect(result.seeded.map((s) => s.athleteId)).toEqual(["a", "b", "c"])
    expect(result.seeded.map((s) => s.seed)).toEqual([1, 2, 3])
    expect(result.rankedCount).toBe(3)
    expect(result.unrankedCount).toBe(0)
  })

  it("does not assume ranks are contiguous", () => {
    // Real ranking data is sparse: only 513-518 of 777 athletes are ranked.
    const result = seedFromPreviousSeason("100m", [
      candidate("a", 100, 17),
      candidate("b", 200, 4),
      candidate("c", 300, 109),
    ])
    expect(result.seeded.map((s) => s.athleteId)).toEqual(["b", "a", "c"])
  })

  it("records the basis and the rank for traceability", () => {
    const result = seedFromPreviousSeason("100m", [candidate("a", 100, 5)])
    expect(result.seeded[0]).toEqual({ athleteId: "a", seed: 1, basis: "previous_rank", previousRank: 5 })
  })
})

describe("seedFromPreviousSeason — unranked athletes (Q7)", () => {
  it("places unranked athletes after every ranked athlete", () => {
    const result = seedFromPreviousSeason("100m", [
      candidate("unranked1", 500, null),
      candidate("ranked1", 100, 1),
      candidate("unranked2", 400, null),
      candidate("ranked2", 200, 2),
    ])
    expect(result.seeded.map((s) => s.athleteId)).toEqual(["ranked1", "ranked2", "unranked2", "unranked1"])
  })

  it("orders unranked athletes by federation number ascending, never randomly", () => {
    const result = seedFromPreviousSeason("100m", [
      candidate("c", 2650, null),
      candidate("a", 105, null),
      candidate("b", 1339, null),
    ])
    expect(result.seeded.map((s) => s.athleteId)).toEqual(["a", "b", "c"])
  })

  it("flags that unranked athletes were placed last", () => {
    const result = seedFromPreviousSeason("100m", [candidate("a", 100, 1), candidate("b", 200, null)])
    expect(result.flags.map((f) => f.openQuestion)).toContain("Q7")
    expect(result.unrankedCount).toBe(1)
  })

  it("still permits official seeding — an unranked field is the normal case", () => {
    // A third of the real field is unranked; refusing to seed would make the
    // system unusable, so Q7 is a documented default, not a blocker.
    const result = seedFromPreviousSeason("100m", [candidate("a", 100, null), candidate("b", 200, null)])
    expect(maySeedOfficially(result)).toBe(true)
  })

  it("handles a field with no ranked athletes at all", () => {
    const result = seedFromPreviousSeason("middle", [candidate("b", 200, null), candidate("a", 100, null)])
    expect(result.seeded.map((s) => s.athleteId)).toEqual(["a", "b"])
    expect(result.rankedCount).toBe(0)
  })
})

describe("seedFromPreviousSeason — unusable source rankings (Q2)", () => {
  it("treats a flagged ranking as unranked rather than coercing it", () => {
    // The 138 `Heat N` strings in ترتيب 800m-1000m Track Cup.
    const result = seedFromPreviousSeason("middle", [
      candidate("good", 100, 1),
      candidate("corrupt", 200, null, { rankNeedsReview: true, rankRaw: "Heat 5" }),
    ])
    expect(result.seeded.map((s) => s.athleteId)).toEqual(["good", "corrupt"])
    expect(result.seeded[1]!.basis).toBe("rank_unusable")
    expect(result.seeded[1]!.previousRank).toBeNull()
  })

  it("never lets a flagged rank influence the order even if a number is present", () => {
    // `Heat 5` must not become rank 5 and jump ahead of genuine rank 9.
    const result = seedFromPreviousSeason("middle", [
      candidate("corrupt", 100, 5, { rankNeedsReview: true, rankRaw: "Heat 5" }),
      candidate("genuine", 200, 9),
    ])
    expect(result.seeded.map((s) => s.athleteId)).toEqual(["genuine", "corrupt"])
  })

  it("BLOCKS official seeding when source data is unusable", () => {
    const result = seedFromPreviousSeason("middle", [
      candidate("a", 100, 1),
      candidate("b", 200, null, { rankNeedsReview: true, rankRaw: "Heat 3" }),
    ])
    expect(maySeedOfficially(result)).toBe(false)
    expect(result.flags.map((f) => f.openQuestion)).toContain("Q2")
    expect(result.flags.find((f) => f.openQuestion === "Q2")!.detail).toMatch(/Heat 3/)
  })

  it("flags duplicate previous-season ranks as inconsistent data", () => {
    const result = seedFromPreviousSeason("100m", [candidate("a", 100, 3), candidate("b", 200, 3)])
    expect(maySeedOfficially(result)).toBe(false)
    expect(result.flags.find((f) => f.openQuestion === "Q2")!.detail).toMatch(/shared by more than one/)
    // Order must still be deterministic despite the inconsistency.
    expect(result.seeded.map((s) => s.athleteId)).toEqual(["a", "b"])
  })
})

describe("seedFromPreviousSeason — determinism", () => {
  it("produces identical output across repeated calls", () => {
    const candidates = [
      candidate("c", 300, null),
      candidate("a", 100, 2),
      candidate("d", 400, null),
      candidate("b", 200, 1),
    ]
    const first = seedFromPreviousSeason("100m", candidates)
    for (let i = 0; i < 20; i++) {
      expect(seedFromPreviousSeason("100m", candidates).seeded).toEqual(first.seeded)
    }
  })

  it("is independent of input order", () => {
    const base = [candidate("a", 100, 1), candidate("b", 200, 2), candidate("c", 300, null)]
    const shuffled = [base[2]!, base[0]!, base[1]!]
    expect(seedFromPreviousSeason("100m", shuffled).seeded).toEqual(seedFromPreviousSeason("100m", base).seeded)
  })

  it("rejects duplicate athlete entries rather than seeding one twice", () => {
    expect(() =>
      seedFromPreviousSeason("100m", [candidate("a", 100, 1), candidate("a", 100, 2)])
    ).toThrow(/duplicate athlete entries/)
  })

  it("handles an empty field", () => {
    const result = seedFromPreviousSeason("100m", [])
    expect(result.seeded).toEqual([])
    expect(result.flags).toEqual([])
  })
})

describe("splitClassificationLevels — Article 9 (second)", () => {
  const seeded = seedFromPreviousSeason(
    "100m",
    Array.from({ length: 20 }, (_, i) => candidate(`a${i + 1}`, 100 + i, i + 1))
  ).seeded

  it("puts the top 16 in level A for 100m, the rest in level B", () => {
    const { levelA, levelB } = splitClassificationLevels(seeded, LEVEL_A_SIZE["100m"]!)
    expect(levelA).toHaveLength(16)
    expect(levelB).toHaveLength(4)
    expect(levelA[0]!.athleteId).toBe("a1")
    expect(levelB[0]!.athleteId).toBe("a17")
  })

  it("uses the official level A size for each race", () => {
    expect(LEVEL_A_SIZE["100m"]).toBe(16)
    expect(LEVEL_A_SIZE.one_lap).toBe(16)
    expect(LEVEL_A_SIZE["500m"]).toBe(16)
    expect(LEVEL_A_SIZE["200m"]).toBe(12)
    expect(LEVEL_A_SIZE.middle).toBe(24)
  })

  it("leaves level B empty when the field is smaller than level A", () => {
    const small = seeded.slice(0, 10)
    const { levelA, levelB } = splitClassificationLevels(small, 16)
    expect(levelA).toHaveLength(10)
    expect(levelB).toHaveLength(0)
  })

  it("rejects an invalid level A size", () => {
    expect(() => splitClassificationLevels(seeded, 0)).toThrow(/Invalid level A size/)
  })
})
