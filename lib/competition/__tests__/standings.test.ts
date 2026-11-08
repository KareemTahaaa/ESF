/**
 * Season points and standings from approved results (Article 5, Article 8 and
 * the federation's answers of 2026-11-08). Synthetic athletes only.
 */

import { describe, expect, it } from "vitest"
import { SEASON_2026_2027 } from "../rules/rulesets/season-2026-2027"
import type { CategoryId, ResultStatus } from "../rules/types"
import { championshipStandings, genderOfEvent, raceStandings, type RoundResults, type StandingLine } from "../standings"

const R = SEASON_2026_2027
// Event 1 = senior girls, event 2 = senior boys (start-list.ts numbering).
const SENIOR_BOYS = 2

function line(n: number, opts: Partial<StandingLine> & { club?: string } = {}): StandingLine {
  return {
    athleteId: `a${n}`,
    federationNumber: n,
    fullName: `لاعب ${n}`,
    clubCode: opts.club ?? "SSC",
    eventNumber: SENIOR_BOYS,
    categoryId: "senior" as CategoryId,
    heatNumber: 1,
    status: "ok" as ResultStatus,
    timeCs: null,
    position: null,
    ...opts,
  }
}

const round = (roundKey: string, lines: StandingLine[], published = true): RoundResults => ({
  roundId: `round-${roundKey}`,
  roundKey,
  resultSetId: `set-${roundKey}`,
  eventName: "الجولة",
  published,
  lines,
})

const placesOf = (s: ReturnType<typeof raceStandings>[number]) =>
  Object.fromEntries(s.placings.map((p) => [p.athleteId, [p.place, p.points, p.note]]))

describe("event numbers", () => {
  it("alternate girls and boys", () => {
    expect([1, 2, 3, 4].map(genderOfEvent)).toEqual(["F", "M", "F", "M"])
  })
})

describe("100m: Final A places 1st/2nd, Final B 3rd/4th, everyone else scores nothing", () => {
  const r16 = round("r16", Array.from({ length: 16 }, (_, i) => line(i + 1, { heatNumber: (i % 8) + 1, position: i < 8 ? 1 : 2 })))
  const qf = round("qf", Array.from({ length: 8 }, (_, i) => line(i + 1, { heatNumber: (i % 4) + 1, position: i < 4 ? 1 : 2 })))
  const sf = round("sf", [line(1, { position: 1 }), line(4, { position: 2 }), line(2, { heatNumber: 2, position: 1 }), line(3, { heatNumber: 2, position: 2 })])
  const finalA = round("final_a", [line(2, { position: 1 }), line(1, { position: 2 })])
  const finalB = round("final_b", [line(3, { position: 1 }), line(4, { position: 2 })])
  const levelB = round("level_b", [line(17, { position: 1 }), line(18, { position: 2 })])
  const keys = ["r16", "qf", "sf", "final_a", "final_b", "level_b"]

  it("awards the senior table to the four final places only", () => {
    const [s] = raceStandings({ championship: "national_league", race: "100m", roundKeys: keys, results: [r16, qf, sf, finalA, finalB, levelB] }, R)
    expect(s!.complete).toBe(true)
    const p = placesOf(s!)
    expect(p.a2).toEqual([1, 100, "scored"])
    expect(p.a1).toEqual([2, 90, "scored"])
    expect(p.a3).toEqual([3, 80, "scored"])
    expect(p.a4).toEqual([4, 75, "scored"])
    expect(p.a5).toEqual([null, 0, "out_before_final"])
    expect(p.a16).toEqual([null, 0, "out_before_final"])
    expect(p.a17).toEqual([null, 0, "level_b"])
    // Level B does not count toward the three-athlete minimum, the 16 level A athletes do.
    expect(s!.participants).toBe(16)
  })

  it("scores nothing until both finals have approved results", () => {
    const [s] = raceStandings({ championship: "national_league", race: "100m", roundKeys: keys, results: [r16, qf, sf, finalA] }, R)
    expect(s!.complete).toBe(false)
    expect(s!.placings.every((p) => p.points === 0)).toBe(true)
  })

  it("marks a race whose deciding result is approved but not yet published", () => {
    const [s] = raceStandings(
      { championship: "national_league", race: "100m", roundKeys: keys, results: [r16, qf, sf, finalA, { ...finalB, published: false }] },
      R
    )
    expect(s!.unpublished).toBe(true)
  })
})

describe("finals of four (One Lap, 500m, 800/1000m)", () => {
  it("places 1st-4th from the recorded places, shares a tie and skips the next place (Q6)", () => {
    const final = round("final", [line(1, { position: 1 }), line(2, { position: 2 }), line(3, { position: 2 }), line(4, { position: 4 })])
    const [s] = raceStandings({ championship: "national_league", race: "500m", roundKeys: ["r16", "sf", "final"], results: [final] }, R)
    const p = placesOf(s!)
    expect(p.a2).toEqual([2, 90, "scored"])
    expect(p.a3).toEqual([2, 90, "scored"])
    expect(p.a4).toEqual([4, 75, "scored"])
    expect(s!.placings.find((x) => x.athleteId === "a2")!.tied).toBe(true)
  })

  it("a DNS / DQ in the final scores nothing (Q19)", () => {
    const final = round("final", [line(1, { position: 1 }), line(2, { position: 2 }), line(3, { position: 3 }), line(4, { status: "dq" })])
    const [s] = raceStandings({ championship: "egypt_cup", race: "middle", roundKeys: ["r24", "r12", "final"], results: [final] }, R)
    expect(placesOf(s!).a4).toEqual([null, 0, "did_not_finish"])
  })

  it("no points in a category with fewer than three athletes (Article 5)", () => {
    const final = round("final", [line(1, { position: 1 }), line(2, { position: 2 })])
    const [s] = raceStandings({ championship: "national_league", race: "one_lap", roundKeys: ["r16", "sf", "final"], results: [final] }, R)
    expect(placesOf(s!).a1).toEqual([1, 0, "below_minimum"])
  })
})

describe("200m: one final of 12, ranked by time", () => {
  it("places by time across the heats of one; 9th and below score nothing", () => {
    const final = round("final", Array.from({ length: 10 }, (_, i) => line(i + 1, { heatNumber: i + 1, position: 1, timeCs: 2000 + (10 - i) * 10 })))
    const [s] = raceStandings({ championship: "national_league", race: "200m", roundKeys: ["final", "level_b"], results: [final] }, R)
    const p = placesOf(s!)
    expect(p.a10).toEqual([1, 100, "scored"])
    expect(p.a3).toEqual([8, 55, "scored"])
    expect(p.a2).toEqual([9, 0, "outside_points"])
  })
})

describe("long-distance races", () => {
  it("use the places the officials recorded", () => {
    const race = round("race", [line(5, { position: 2 }), line(6, { position: 1 }), line(7, { position: 3 })])
    const [s] = raceStandings({ championship: "national_league", race: "points_10000_road", roundKeys: ["race"], results: [race] }, R)
    expect(placesOf(s!).a6).toEqual([1, 100, "scored"])
  })
})

describe("refuses what has no season points", () => {
  it("the Qualifications (Q20) and relay (Q10)", () => {
    expect(() => raceStandings({ championship: "qualifications", race: "100m", roundKeys: [], results: [] }, R)).toThrow(/Q20/)
    expect(() => raceStandings({ championship: "national_league", race: "relay_3000", roundKeys: [], results: [] }, R)).toThrow(/Q10/)
  })
})

describe("championship totals", () => {
  const final500 = round("final", [line(1, { position: 1 }), line(2, { position: 2, club: "ZSC" }), line(3, { position: 3 }), line(4, { position: 4, club: "ZSC" })])
  const finalLap = round("final", [line(2, { position: 1, club: "ZSC" }), line(1, { position: 2 }), line(3, { position: 3 }), line(4, { position: 4, club: "ZSC" })])
  const races = [
    ...raceStandings({ championship: "national_league", race: "500m", roundKeys: ["final"], results: [final500] }, R),
    ...raceStandings({ championship: "national_league", race: "one_lap", roundKeys: ["final"], results: [finalLap] }, R),
  ]

  it("adds each athlete's points across races, with the races that produced them", () => {
    const s = championshipStandings("national_league", races, ["SSC", "ZSC", "AHL"], R)
    const a1 = s.athletes.find((a) => a.athleteId === "a1")!
    expect(a1.points).toBe(190)
    expect(a1.contributions.map((c) => [c.race, c.place, c.points])).toEqual([
      ["500m", 1, 100],
      ["one_lap", 2, 90],
    ])
    // a1 and a2 both have 190: they share 1st.
    expect(s.athletes.filter((a) => a.rank === 1).map((a) => a.athleteId).sort()).toEqual(["a1", "a2"])
    expect(s.athletes.find((a) => a.athleteId === "a3")!.rank).toBe(3)
  })

  it("ranks clubs by their athletes' points, keeping clubs with none (Article 8)", () => {
    const s = championshipStandings("national_league", races, ["SSC", "ZSC", "AHL"], R)
    expect(s.clubs.map((c) => [c.clubId, c.points, c.rank])).toEqual([
      ["SSC", 100 + 80 + 90 + 80, 1],
      ["ZSC", 90 + 75 + 100 + 75, 2],
      ["AHL", 0, 3],
    ])
  })

  it("counts only completed races", () => {
    const incomplete = raceStandings({ championship: "national_league", race: "100m", roundKeys: ["final_a", "final_b"], results: [round("final_a", [line(9, { position: 1 }), line(10, { position: 2 }), line(11, { position: 3 })])] }, R)
    const s = championshipStandings("national_league", [...races, ...incomplete], ["SSC"], R)
    expect(s.athletes.find((a) => a.athleteId === "a9")).toBeUndefined()
  })

  it("leaves points with the club the athlete raced for when they scored", () => {
    const later = round("final", [line(1, { position: 1, club: "AHL" }), line(5, { position: 2 }), line(6, { position: 3 })])
    const withTransfer = [...races, ...raceStandings({ championship: "national_league", race: "200m", roundKeys: ["final"], results: [later] }, R)]
    const s = championshipStandings("national_league", withTransfer, ["SSC", "ZSC", "AHL"], R)
    expect(s.clubs.find((c) => c.clubId === "AHL")!.points).toBe(100)
    expect(s.athletes.find((a) => a.athleteId === "a1")!.contributions.map((c) => c.clubCode)).toEqual(["SSC", "SSC", "AHL"])
  })
})
