/**
 * Season points and standings, worked out from approved results only.
 *
 * Nothing here is stored: every figure is recomputed from the approved (or, for
 * clubs and the public, published) result sets each time, so a corrected result
 * can never leave duplicated or stale points behind.
 *
 * Article 5 gives the points table, the three-athlete minimum and equal points
 * for a shared place; Article 8 gives club standings per championship. What the
 * regulations do not say was decided by the federation on 2026-11-08
 * (docs/rules/OPEN_QUESTIONS.md Q17-Q20):
 *
 *   - knockout races (100m, One Lap, 500m, 800/1000m) score only the places the
 *     final decides: 1st-4th (100m: Final A = 1st/2nd, Final B = 3rd/4th);
 *     athletes knocked out earlier score nothing;
 *   - the 200m final of 12 is ranked by time, 1st-12th;
 *   - long-distance races (points, elimination) are ranked by the final places
 *     the officials record;
 *   - level B scores nothing;
 *   - DNS / DNF / DQ / FS score nothing;
 *   - the Qualifications award no season points.
 *
 * Assumption (Q21): in a merged junior + youth long-distance race everyone
 * scores from the junior (شباب) points table — the race is run, and counted for
 * the three-athlete minimum, as one category.
 */

import { pointsForPosition } from "./rules/points"
import { findBracket, type RoundSpec } from "./rules/progression"
import { calculateClubStandings, type ClubStanding } from "./rules/club-standings"
import type { CategoryId, Championship, Gender, RaceCode, ResultStatus, SeasonRuleset } from "./rules/types"

export interface StandingLine {
  readonly athleteId: string
  readonly federationNumber: number
  readonly fullName: string
  /** The club the athlete raced for in this result (Article 8: points stay with it). */
  readonly clubCode: string
  readonly eventNumber: number
  readonly categoryId: CategoryId
  readonly heatNumber: number | null
  readonly status: ResultStatus
  readonly timeCs: number | null
  readonly position: number | null
}

/** The approved results of one round. */
export interface RoundResults {
  readonly roundId: string
  readonly roundKey: string
  readonly resultSetId: string
  readonly eventName: string
  /** False while approved but not yet published: shown to the federation only. */
  readonly published: boolean
  readonly lines: readonly StandingLine[]
}

/** One race of a championship (e.g. League 100m) across all its rounds and events. */
export interface RaceInput {
  readonly championship: Championship
  readonly race: RaceCode
  /** Round keys that exist for this race this season, with or without results. */
  readonly roundKeys: readonly string[]
  /** Rounds whose results are approved or published. */
  readonly results: readonly RoundResults[]
}

export interface Placing {
  readonly athleteId: string
  readonly federationNumber: number
  readonly fullName: string
  readonly clubCode: string
  readonly categoryId: CategoryId
  /** Final place, or null for an athlete the final did not place (knocked out earlier, level B, DNS…). */
  readonly place: number | null
  readonly points: number
  readonly tied: boolean
  readonly note: PlacingNote
}

export type PlacingNote =
  | "scored"
  | "outside_points"
  | "out_before_final"
  | "level_b"
  | "did_not_finish"
  | "below_minimum"

export interface RaceStanding {
  readonly championship: Championship
  readonly race: RaceCode
  readonly eventNumber: number
  /** The category the group raced as (the senior name for a merged group). */
  readonly categoryId: CategoryId
  readonly gender: Gender
  /** True once every round that decides the places has approved results. */
  readonly complete: boolean
  /** Where the deciding results come from, for traceability. */
  readonly sources: readonly { readonly roundId: string; readonly roundKey: string; readonly resultSetId: string; readonly eventName: string; readonly published: boolean }[]
  /** True when a deciding result is approved but not yet published. */
  readonly unpublished: boolean
  readonly participants: number
  readonly placings: readonly Placing[]
  readonly rulesetVersion: string
}

const GENDERS: readonly Gender[] = ["F", "M"]

/** Event numbers alternate girls / boys per category (start-list.ts `eventNumber`). */
export function genderOfEvent(eventNumber: number): Gender {
  return GENDERS[(eventNumber - 1) % 2]!
}

/** Ranks by a key (lower = better); equal keys share the place and the next is skipped (Q6). */
function rankBy<T>(items: readonly T[], key: (t: T) => number): Map<T, number> {
  const sorted = [...items].sort((a, b) => key(a) - key(b))
  const places = new Map<T, number>()
  sorted.forEach((item, i) => {
    const previous = sorted[i - 1]
    places.set(item, previous !== undefined && key(previous) === key(item) ? places.get(previous)! : i + 1)
  })
  return places
}

interface Decider {
  readonly roundKey: string
  /** Places before this round's first place (Final B starts after Final A's 2). */
  readonly offset: number
  /** Rank by the recorded place in the single heat, or by time across the round. */
  readonly by: "position" | "time"
}

/** The rounds that decide the final places of a race, in place order. */
function decidersFor(championship: Championship, race: RaceCode): Decider[] {
  if (race.startsWith("points_") || race.startsWith("elimination_")) return [{ roundKey: "race", offset: 0, by: "position" }]
  const finals = findBracket(championship, race).rounds.filter((r): r is RoundSpec & { advance: { kind: "final"; places: number } } => r.advance.kind === "final")
  let offset = 0
  return finals.map((r) => {
    const d: Decider = { roundKey: r.id, offset, by: r.heats === 1 ? "position" : "time" }
    offset += r.advance.places
    return d
  })
}

/** Places within one deciding round for one group. Non-finishers get none. */
function placeWithin(lines: readonly StandingLine[], decider: Decider): Map<string, number> {
  const finishers = lines.filter((l) => l.status === "ok")
  const key =
    decider.by === "time"
      ? (l: StandingLine) => l.timeCs ?? Number.MAX_SAFE_INTEGER
      : (l: StandingLine) => l.position ?? (l.timeCs !== null ? 1000 + l.timeCs / 1e6 : Number.MAX_SAFE_INTEGER)
  const ranks = rankBy(finishers, key)
  return new Map(finishers.map((l) => [l.athleteId, decider.offset + ranks.get(l)!]))
}

/**
 * Final places and points for every category × gender group of one race.
 * Throws for the Qualifications (no season points) and for relay (Q10).
 */
export function raceStandings(input: RaceInput, ruleset: SeasonRuleset): RaceStanding[] {
  if (input.championship === "qualifications") throw new Error("The Qualifications award no season points (Q20).")
  if (input.race === "relay_3000") throw new Error("Relay has no scoring rule (Q10).")

  const deciders = decidersFor(input.championship, input.race).filter((d) => input.roundKeys.includes(d.roundKey))
  const byKey = new Map(input.results.map((r) => [r.roundKey, r]))
  const complete = deciders.length > 0 && deciders.every((d) => byKey.has(d.roundKey))
  const sources = deciders.flatMap((d) => {
    const r = byKey.get(d.roundKey)
    return r ? [{ roundId: r.roundId, roundKey: r.roundKey, resultSetId: r.resultSetId, eventName: r.eventName, published: r.published }] : []
  })

  // Everyone who raced in any round of this race, per group.
  const groups = new Map<number, Map<string, { line: StandingLine; levelB: boolean }>>()
  for (const r of input.results) {
    for (const line of r.lines) {
      const group = groups.get(line.eventNumber) ?? new Map()
      const seen = group.get(line.athleteId)
      // The latest round's line wins for name and club; level B is remembered.
      group.set(line.athleteId, { line, levelB: (seen?.levelB ?? false) || r.roundKey === "level_b" })
      groups.set(line.eventNumber, group)
    }
  }

  const standings: RaceStanding[] = []
  for (const [eventNumber, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const lines = [...group.values()]
    const categoryId = lines.find((l) => !l.levelB)?.line.categoryId ?? lines[0]!.line.categoryId
    const groupCategory = ruleset.categories.some((c) => c.id === categoryId) ? categoryId : lines[0]!.line.categoryId

    const places = new Map<string, number>()
    const decided = new Set<string>()
    for (const d of deciders) {
      const r = byKey.get(d.roundKey)
      if (!r) continue
      const inGroup = r.lines.filter((l) => l.eventNumber === eventNumber)
      for (const l of inGroup) decided.add(l.athleteId)
      for (const [id, place] of placeWithin(inGroup, d)) places.set(id, place)
    }

    // Article 5: no points in a category with fewer than three athletes.
    const participants = lines.filter((l) => !l.levelB).length
    const scoring = participants >= ruleset.minimumAthletesForPoints
    const placeCounts = new Map<number, number>()
    for (const p of places.values()) placeCounts.set(p, (placeCounts.get(p) ?? 0) + 1)

    const placings: Placing[] = lines.map(({ line, levelB }) => {
      const place = places.get(line.athleteId) ?? null
      const base = {
        athleteId: line.athleteId,
        federationNumber: line.federationNumber,
        fullName: line.fullName,
        clubCode: line.clubCode,
        categoryId: line.categoryId,
        place,
        tied: place !== null && (placeCounts.get(place) ?? 0) > 1,
      }
      if (place === null) {
        const note: PlacingNote = decided.has(line.athleteId) ? "did_not_finish" : levelB ? "level_b" : "out_before_final"
        return { ...base, points: 0, note }
      }
      if (!complete) return { ...base, points: 0, note: "outside_points" as const }
      if (!scoring) return { ...base, points: 0, note: "below_minimum" as const }
      const points = pointsForPosition(groupCategory, place, ruleset)
      return { ...base, points, note: points > 0 ? ("scored" as const) : ("outside_points" as const) }
    })
    placings.sort(
      (a, b) =>
        (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER) ||
        NOTE_ORDER.indexOf(a.note) - NOTE_ORDER.indexOf(b.note) ||
        a.federationNumber - b.federationNumber
    )

    standings.push({
      championship: input.championship,
      race: input.race,
      eventNumber,
      categoryId: groupCategory,
      gender: genderOfEvent(eventNumber),
      complete,
      sources,
      unpublished: sources.some((s) => !s.published),
      participants,
      placings,
      rulesetVersion: ruleset.version,
    })
  }
  return standings
}

const NOTE_ORDER: readonly PlacingNote[] = ["scored", "outside_points", "below_minimum", "did_not_finish", "out_before_final", "level_b"]

// ---------------------------------------------------------------------------
// Championship totals
// ---------------------------------------------------------------------------

export interface AthleteStanding {
  readonly athleteId: string
  readonly federationNumber: number
  readonly fullName: string
  /** The club of the athlete's most recent scoring result. */
  readonly clubCode: string
  readonly categoryId: CategoryId
  readonly gender: Gender
  readonly rank: number
  readonly points: number
  readonly tied: boolean
  /** Every race that contributed, for traceability. */
  readonly contributions: readonly { readonly race: RaceCode; readonly place: number; readonly points: number; readonly clubCode: string; readonly unpublished: boolean }[]
}

export interface ChampionshipStandings {
  readonly championship: Championship
  readonly rulesetVersion: string
  readonly races: readonly RaceStanding[]
  /** Per category × gender, best first. */
  readonly athletes: readonly AthleteStanding[]
  readonly clubs: readonly ClubStanding[]
}

/**
 * Season totals for one championship: athletes per category and gender, and
 * clubs (Article 8). Only completed races count. Points stay with the club the
 * athlete raced for in that race.
 */
export function championshipStandings(
  championship: Championship,
  races: readonly RaceStanding[],
  clubCodes: readonly string[],
  ruleset: SeasonRuleset
): ChampionshipStandings {
  const counted = races.filter((r) => r.championship === championship && r.complete)

  const totals = new Map<string, Omit<AthleteStanding, "rank" | "tied">>()
  for (const race of counted) {
    for (const p of race.placings) {
      if (p.points <= 0 || p.place === null) continue
      const key = `${race.categoryId}|${race.gender}|${p.athleteId}`
      const t = totals.get(key) ?? {
        athleteId: p.athleteId,
        federationNumber: p.federationNumber,
        fullName: p.fullName,
        clubCode: p.clubCode,
        categoryId: race.categoryId,
        gender: race.gender,
        points: 0,
        contributions: [],
      }
      totals.set(key, {
        ...t,
        clubCode: p.clubCode,
        points: t.points + p.points,
        contributions: [...t.contributions, { race: race.race, place: p.place, points: p.points, clubCode: p.clubCode, unpublished: race.unpublished }],
      })
    }
  }

  const athletes: AthleteStanding[] = []
  const byGroup = new Map<string, Omit<AthleteStanding, "rank" | "tied">[]>()
  for (const t of totals.values()) {
    const g = `${t.categoryId}|${t.gender}`
    byGroup.set(g, [...(byGroup.get(g) ?? []), t])
  }
  for (const list of byGroup.values()) {
    const ranks = rankBy(list, (t) => -t.points)
    const counts = new Map<number, number>()
    for (const r of ranks.values()) counts.set(r, (counts.get(r) ?? 0) + 1)
    for (const t of list) athletes.push({ ...t, rank: ranks.get(t)!, tied: (counts.get(ranks.get(t)!) ?? 0) > 1 })
  }
  const categoryIndex = (id: CategoryId) => ruleset.categories.findIndex((c) => c.id === id)
  athletes.sort(
    (a, b) =>
      categoryIndex(a.categoryId) - categoryIndex(b.categoryId) ||
      GENDERS.indexOf(a.gender) - GENDERS.indexOf(b.gender) ||
      a.rank - b.rank ||
      a.federationNumber - b.federationNumber
  )

  const awards = counted.flatMap((race) =>
    race.placings
      .filter((p) => p.points > 0)
      .map((p) => ({
        athleteId: p.athleteId,
        clubId: p.clubCode,
        championship,
        points: p.points,
        resultId: `${race.race}:${race.eventNumber}`,
      }))
  )
  const clubs = ruleset.clubStandingsChampionships.includes(championship)
    ? calculateClubStandings(championship, awards, clubCodes, ruleset).standings
    : []

  return { championship, rulesetVersion: ruleset.version, races: races.filter((r) => r.championship === championship), athletes, clubs }
}
