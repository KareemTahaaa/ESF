/**
 * Article 8 club standings tests.
 */

import { describe, expect, it } from "vitest"
import { calculateAthleteTotals, calculateClubStandings } from "../rules/club-standings"
import type { ClubPointsAward } from "../rules/club-standings"
import { SEASON_2026_2027 } from "../rules/rulesets/season-2026-2027"
import type { Championship } from "../rules/types"

const ruleset = SEASON_2026_2027

function award(
  resultId: string,
  athleteId: string,
  clubId: string,
  points: number,
  championship: Championship = "national_league"
): ClubPointsAward {
  return { resultId, athleteId, clubId, points, championship }
}

describe("calculateClubStandings — Article 8", () => {
  it("sums each club's athlete points within the championship", () => {
    const result = calculateClubStandings(
      "national_league",
      [award("r1", "a1", "WDC", 100), award("r1", "a2", "TGC", 90), award("r2", "a3", "WDC", 80)],
      ["WDC", "TGC"],
      ruleset
    )
    expect(result.standings.map((s) => [s.clubId, s.points, s.rank])).toEqual([
      ["WDC", 180, 1],
      ["TGC", 90, 2],
    ])
  })

  it("keeps championships separate — League and Cup never pool", () => {
    const awards = [award("r1", "a1", "WDC", 100, "national_league"), award("r2", "a2", "TGC", 100, "egypt_cup")]
    const league = calculateClubStandings("national_league", awards, ["WDC", "TGC"], ruleset)
    const cup = calculateClubStandings("egypt_cup", awards, ["WDC", "TGC"], ruleset)
    expect(league.standings.find((s) => s.clubId === "TGC")!.points).toBe(0)
    expect(cup.standings.find((s) => s.clubId === "WDC")!.points).toBe(0)
  })

  it("refuses the qualification round, which Article 8 excludes", () => {
    expect(() => calculateClubStandings("qualifications", [], ["WDC"], ruleset)).toThrow(/excluded/)
  })

  it("credits the club at the time of the result, not the athlete's current club", () => {
    // Athlete a1 scored for TGC, then transferred to WDC and scored again.
    const result = calculateClubStandings(
      "national_league",
      [award("r1", "a1", "TGC", 100), award("r2", "a1", "WDC", 90)],
      ["WDC", "TGC"],
      ruleset
    )
    expect(result.standings.find((s) => s.clubId === "TGC")!.points).toBe(100)
    expect(result.standings.find((s) => s.clubId === "WDC")!.points).toBe(90)
  })

  it("shows a club with no scoring athletes at 0 rather than dropping it", () => {
    const result = calculateClubStandings("national_league", [award("r1", "a1", "WDC", 100)], ["WDC", "NPC"], ruleset)
    expect(result.standings.find((s) => s.clubId === "NPC")).toMatchObject({ points: 0, rank: 2 })
  })

  it("shares a rank on equal points rather than inventing a tie-break", () => {
    const result = calculateClubStandings(
      "national_league",
      [award("r1", "a1", "WDC", 100), award("r1", "a2", "TGC", 100), award("r1", "a3", "SSC", 50)],
      ["WDC", "TGC", "SSC"],
      ruleset
    )
    const byClub = new Map(result.standings.map((s) => [s.clubId, s]))
    expect(byClub.get("WDC")).toMatchObject({ rank: 1, tied: true })
    expect(byClub.get("TGC")).toMatchObject({ rank: 1, tied: true })
    expect(byClub.get("SSC")).toMatchObject({ rank: 3, tied: false })
  })

  it("rejects a duplicated award so a re-import cannot double-count", () => {
    expect(() =>
      calculateClubStandings("national_league", [award("r1", "a1", "WDC", 100), award("r1", "a1", "WDC", 100)], ["WDC"], ruleset)
    ).toThrow(/Duplicate points award/)
  })

  it("rejects negative or non-finite points", () => {
    expect(() => calculateClubStandings("national_league", [award("r1", "a1", "WDC", -5)], ["WDC"], ruleset)).toThrow(
      /Invalid points/
    )
  })

  it("lists contributing results for traceability, and records the ruleset version", () => {
    const result = calculateClubStandings(
      "national_league",
      [award("r1", "a1", "WDC", 100), award("r2", "a2", "WDC", 0)],
      ["WDC"],
      ruleset
    )
    expect(result.standings[0]!.contributingResultIds).toEqual(["r1"])
    expect(result.rulesetVersion).toBe("2026-2027.r1")
  })
})

describe("calculateAthleteTotals — traceable season points", () => {
  it("sums an athlete's points across clubs and keeps every contribution", () => {
    const totals = calculateAthleteTotals("national_league", [
      award("r1", "a1", "TGC", 100),
      award("r2", "a1", "WDC", 90),
      award("r3", "a2", "WDC", 80),
    ])
    expect(totals.map((t) => [t.athleteId, t.points])).toEqual([
      ["a1", 190],
      ["a2", 80],
    ])
    expect(totals[0]!.contributions.map((c) => c.resultId)).toEqual(["r1", "r2"])
  })

  it("ignores other championships", () => {
    const totals = calculateAthleteTotals("egypt_cup", [award("r1", "a1", "WDC", 100, "national_league")])
    expect(totals).toEqual([])
  })

  it("rejects a duplicated award", () => {
    expect(() =>
      calculateAthleteTotals("national_league", [award("r1", "a1", "WDC", 100), award("r1", "a1", "WDC", 100)])
    ).toThrow(/Duplicate/)
  })
})
