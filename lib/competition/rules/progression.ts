/**
 * Round structure and advancement — Article 9 (second), Tables 10-12, and the
 * per-race qualification targets in `Races 2026-2027.docx`.
 *
 * Brackets are declared as DATA, one definition per championship and race, so
 * each is auditable against its source row and testable in isolation. The
 * executor is shared, but the definitions are distinct: the brief requires
 * distinct, testable logic per race type, and a shared executor with a wrong
 * definition would be indistinguishable from correct behaviour without them.
 *
 * Every definition cites the catalogue row and rulebook table it comes from.
 */

import { distributeIntoHeatsOfSize, distributeSerpentine } from "./heats"
import { RuleIncompleteError } from "./types"
import type { Championship, RaceCode } from "./types"

/** How athletes advance out of a round. */
export type AdvanceRule =
  /**
   * The given finishing positions in each heat advance.
   * `[1]` = winner only; `[1, 2]` = first and second.
   */
  | { readonly kind: "heat_positions"; readonly positions: readonly number[] }
  /**
   * Each heat winner advances, then the best remaining times fill the field.
   * Used by the 800/1000m rounds (`يتأهل الأول لكل heat ... ويتم ترتيب باقي
   * اللاعبين بالزمن`).
   */
  | {
      readonly kind: "heat_winners_plus_times"
      readonly additionalByTime: number
      /**
       * When set, times fill the field up to this total instead of adding a
       * fixed number: the 800/1000m qualification sends every heat winner plus
       * the best times to 24, however many heats there were.
       */
      readonly fillTo?: number
    }
  /** The fastest N times advance regardless of heat (qualification rounds). */
  | { readonly kind: "fastest_times"; readonly count: number }
  /**
   * Terminal round: positions are final. `splitFinals` marks the 100m case
   * where 1st of each semi goes to Final A (places 1-2) and 2nd to Final B
   * (places 3-4).
   */
  | { readonly kind: "final"; readonly places: number }

export interface RoundSpec {
  /** Stable round identifier, used for prerequisites and audit records. */
  readonly id: string
  /** Official Arabic round name — preserved, never normalised to a generic label. */
  readonly nameAr: string
  /** Number of heats in this round, or `by_field_size` for size-driven rounds. */
  readonly heats: number | "by_field_size"
  /** Athletes per heat, when `heats` is `by_field_size`. */
  readonly athletesPerHeat?: number
  readonly advance: AdvanceRule
  /** Round ids that must have APPROVED results before this round may activate. */
  readonly prerequisites: readonly string[]
  /** Source citation. */
  readonly source: string
  /**
   * Seed the round by the previous round's times, fastest = seed 1, instead of
   * the advancement order (heat winners first). The 800/1000m round of 24.
   */
  readonly seedByTime?: boolean
  /**
   * Set when the round's seeding cannot be derived from the sources. Generating
   * an official start list for it must be refused.
   */
  readonly blockedBy?: { readonly openQuestion: string; readonly detail: string }
}

export interface BracketDefinition {
  readonly championship: Championship
  readonly race: RaceCode
  /** Level A main bracket. */
  readonly rounds: readonly RoundSpec[]
  /** Level B is a single round in every specified case. */
  readonly levelB?: RoundSpec
}

// ---------------------------------------------------------------------------
// Qualification round — Article 9 (first), Table 9; catalogue rows 1-5
// ---------------------------------------------------------------------------

function qualificationRound(race: RaceCode, athletesPerHeat: number, qualifiers: number, row: number): RoundSpec {
  return {
    id: "qualification",
    nameAr: "جولة التصفيات",
    heats: "by_field_size",
    athletesPerHeat,
    advance: { kind: "fastest_times", count: qualifiers },
    prerequisites: [],
    source: `Races 2026-2027.docx row ${row}; 2026-2027.docx Article 9 (first) Table 9`,
  }
}

export const QUALIFICATION_ROUNDS: readonly BracketDefinition[] = [
  // Row 1: `تصفيات 200m – يتأهل أفضل 12 زمن`
  { championship: "qualifications", race: "200m", rounds: [qualificationRound("200m", 1, 12, 1)] },
  // Row 2: `تصفيات 500m – يتأهل أفضل 16 زمن`
  { championship: "qualifications", race: "500m", rounds: [qualificationRound("500m", 4, 16, 2)] },
  // Row 3: `تصفيات 800/1000m - يتأهل المركز الأول وأفضل أزمنة (24 متأهلين)`
  {
    championship: "qualifications",
    race: "middle",
    rounds: [
      {
        ...qualificationRound("middle", 4, 24, 3),
        advance: { kind: "heat_winners_plus_times", additionalByTime: 0, fillTo: 24 },
      },
    ],
  },
  // Row 4: `تصفيات 100m – يتأهل أفضل 16 زمن`
  { championship: "qualifications", race: "100m", rounds: [qualificationRound("100m", 2, 16, 4)] },
  // Row 5: `تصفيات One Lap – يتأهل أفضل 16 زمن`
  { championship: "qualifications", race: "one_lap", rounds: [qualificationRound("one_lap", 4, 16, 5)] },
]

// ---------------------------------------------------------------------------
// 100m Road — Tables 10 r1 / 12 r1; catalogue rows 8, 13 (NL), 20, 23 (Cup)
// R16 (8 heats of 2, winner only) -> R8 (4 of 2) -> SF (2 of 2) -> Final A + B
// ---------------------------------------------------------------------------

function sprint100mRounds(nlRows: string): readonly RoundSpec[] {
  return [
    {
      id: "r16",
      nameAr: "دور ال 16",
      heats: 8,
      advance: { kind: "heat_positions", positions: [1] },
      prerequisites: ["qualification"],
      source: `${nlRows}; Table 10 r1 nested 10>1.1.0`,
    },
    {
      id: "qf",
      nameAr: "دور ال 8",
      heats: 4,
      advance: { kind: "heat_positions", positions: [1] },
      prerequisites: ["r16"],
      source: `${nlRows}; Table 10 r1 nested 10>1.1.1`,
    },
    {
      id: "sf",
      nameAr: "نصف النهائي",
      heats: 2,
      // 1st of each semi -> Final A; 2nd of each -> Final B.
      advance: { kind: "heat_positions", positions: [1, 2] },
      prerequisites: ["qf"],
      source: `${nlRows}; Table 10 r1 nested 10>1.1.2`,
    },
    {
      id: "final_a",
      nameAr: "سباق تحديد المركز الأول و الثاني (Final A)",
      heats: 1,
      advance: { kind: "final", places: 2 },
      prerequisites: ["sf"],
      source: `${nlRows}; Table 10 r1`,
    },
    {
      id: "final_b",
      nameAr: "سباق تحديد المركز الثالث و الرابع (Final B)",
      heats: 1,
      advance: { kind: "final", places: 2 },
      prerequisites: ["sf"],
      source: `${nlRows}; Table 10 r1`,
    },
  ]
}

/** Level B: `يتم تقسيم اللاعبين إلى heats من 2 لاعبين بناءً على ترتيبهم في جولة التصفيات`. */
function levelB(race: RaceCode, athletesPerHeat: number, source: string): RoundSpec {
  return {
    id: "level_b",
    nameAr: "مستوى التصنيف الثاني (B)",
    heats: "by_field_size",
    athletesPerHeat,
    advance: { kind: "final", places: 0 },
    prerequisites: ["qualification"],
    source,
  }
}

// ---------------------------------------------------------------------------
// One Lap / 500m — Tables 10 r2, 11 r2, 12 r2; catalogue rows 6, 9, 11, 14, 21, 24
// R16 (4 heats of 4, 1st+2nd) -> SF (2 of 4, 1st+2nd) -> Final (4, places 1-4)
// ---------------------------------------------------------------------------

function fourLaneRounds(source: string): readonly RoundSpec[] {
  return [
    {
      id: "r16",
      nameAr: "دور ال 16",
      heats: 4,
      advance: { kind: "heat_positions", positions: [1, 2] },
      prerequisites: ["qualification"],
      source: `${source} nested 10>2.1.0`,
    },
    {
      id: "sf",
      nameAr: "نصف النهائي",
      heats: 2,
      advance: { kind: "heat_positions", positions: [1, 2] },
      prerequisites: ["r16"],
      source: `${source} nested 10>2.1.1`,
    },
    {
      id: "final",
      nameAr: "دور النهائي",
      heats: 1,
      advance: { kind: "final", places: 4 },
      prerequisites: ["sf"],
      source,
    },
  ]
}

// ---------------------------------------------------------------------------
// 200m Track — Table 11 r1; catalogue row 10
// Pure time trial: heats of one athlete, final ranking by time. No bracket.
// ---------------------------------------------------------------------------

const timeTrialRounds: readonly RoundSpec[] = [
  {
    id: "final",
    nameAr: "دور النهائي",
    heats: "by_field_size",
    athletesPerHeat: 1,
    advance: { kind: "final", places: 12 },
    prerequisites: ["qualification"],
    source: "Races 2026-2027.docx row 10; 2026-2027.docx Table 11 r1",
  },
]

// ---------------------------------------------------------------------------
// 800/1000m Track — Tables 11 r3 / 12 r3; catalogue rows 7, 12 (NL), 19, 22 (Cup)
// R24 (6 heats of 4) -> SF or R12 (3 of 4) -> Final (4)
//
// The R24 seeding table is truncated in the official document; the federation
// answered OPEN_QUESTIONS Q1 on 2026-11-03: heats of 4, best times spread over
// the heats in a snake (1st in heat 1 … 6th in heat 6, then 7th in heat 6 back
// to 12th in heat 1, and so on), so heat 1 holds seeds 1, 12, 13 and 24.
// ---------------------------------------------------------------------------

function middleDistanceRounds(secondRoundId: string, secondRoundNameAr: string, source: string): readonly RoundSpec[] {
  return [
    {
      id: "r24",
      nameAr: "دور ال 24",
      heats: 6,
      // 6 heat winners + the best 6 remaining times -> 12.
      advance: { kind: "heat_winners_plus_times", additionalByTime: 6 },
      prerequisites: ["qualification"],
      seedByTime: true,
      source: `${source}; Table 11 r3; federation answer to Q1 (2026-11-03)`,
    },
    {
      id: secondRoundId,
      nameAr: secondRoundNameAr,
      heats: 3,
      // 3 heat winners + the best remaining time -> 4.
      advance: { kind: "heat_winners_plus_times", additionalByTime: 1 },
      prerequisites: ["r24"],
      source: `${source}; Table 11 r3 nested 11>3.1.2`,
    },
    {
      id: "final",
      nameAr: "دور النهائي",
      heats: 1,
      advance: { kind: "final", places: 4 },
      prerequisites: [secondRoundId],
      source,
    },
  ]
}

// ---------------------------------------------------------------------------
// Bracket registry
// ---------------------------------------------------------------------------

export const BRACKETS: readonly BracketDefinition[] = [
  ...QUALIFICATION_ROUNDS,

  // --- National League -----------------------------------------------------
  {
    championship: "national_league",
    race: "100m",
    rounds: sprint100mRounds("Races 2026-2027.docx rows 8, 13"),
    levelB: levelB("100m", 2, "2026-2027.docx Table 10 r1 level B"),
  },
  {
    championship: "national_league",
    race: "one_lap",
    rounds: fourLaneRounds("Races 2026-2027.docx rows 9, 14; 2026-2027.docx Table 10 r2"),
    levelB: levelB("one_lap", 4, "2026-2027.docx Table 10 r2 level B"),
  },
  {
    championship: "national_league",
    race: "500m",
    rounds: fourLaneRounds("Races 2026-2027.docx rows 6, 11; 2026-2027.docx Table 11 r2"),
    levelB: levelB("500m", 4, "2026-2027.docx Table 11 r2 level B"),
  },
  {
    championship: "national_league",
    race: "200m",
    rounds: timeTrialRounds,
    levelB: levelB("200m", 1, "2026-2027.docx Table 11 r1 level B"),
  },
  {
    championship: "national_league",
    race: "middle",
    // NL uses a semi-final (catalogue row 7).
    rounds: middleDistanceRounds("sf", "نصف النهائي", "Races 2026-2027.docx rows 7, 12"),
    levelB: levelB("middle", 4, "2026-2027.docx Table 11 r3 level B"),
  },

  // --- Egypt Cup -----------------------------------------------------------
  {
    championship: "egypt_cup",
    race: "100m",
    rounds: sprint100mRounds("Races 2026-2027.docx rows 20, 23"),
    levelB: levelB("100m", 2, "2026-2027.docx Table 12 r1 level B"),
  },
  {
    championship: "egypt_cup",
    race: "one_lap",
    rounds: fourLaneRounds("Races 2026-2027.docx rows 21, 24; 2026-2027.docx Table 12 r2"),
    levelB: levelB("one_lap", 4, "2026-2027.docx Table 12 r2 level B"),
  },
  {
    championship: "egypt_cup",
    race: "middle",
    // The Cup uses a round of 12, NOT a semi-final (catalogue row 19). The
    // distinct official name is preserved rather than normalised to "semi".
    rounds: middleDistanceRounds("r12", "دور ال 12", "Races 2026-2027.docx rows 19, 22"),
    levelB: levelB("middle", 4, "2026-2027.docx Table 12 r3 level B"),
  },
]

export function findBracket(championship: Championship, race: RaceCode): BracketDefinition {
  const bracket = BRACKETS.find((b) => b.championship === championship && b.race === race)
  if (!bracket) {
    throw new Error(
      `No bracket defined for ${championship} / ${race}. Long-distance and relay races have no ` +
        `bracket; check eligibility before requesting one.`
    )
  }
  return bracket
}

export function findRound(championship: Championship, race: RaceCode, roundId: string): RoundSpec {
  const bracket = findBracket(championship, race)
  const round = [...bracket.rounds, ...(bracket.levelB ? [bracket.levelB] : [])].find((r) => r.id === roundId)
  if (!round) {
    throw new Error(`Round '${roundId}' is not defined for ${championship} / ${race}.`)
  }
  return round
}

// ---------------------------------------------------------------------------
// Heat generation
// ---------------------------------------------------------------------------

export interface HeatAssignment {
  readonly heatNumber: number
  /** Athlete ids in lane order (lane = index + 1). */
  readonly athleteIds: readonly string[]
}

/**
 * Builds the heats for a round from an ordered list of qualified athletes.
 *
 * `orderedAthleteIds` must already be in seed order: for a first round that is
 * the previous-season seeding, and for a later round the advancement order
 * produced by `computeAdvancement`.
 *
 * Throws `RuleIncompleteError` for a round whose seeding is not derivable from
 * the sources, rather than producing a plausible-looking guess.
 */
export function generateHeats(round: RoundSpec, orderedAthleteIds: readonly string[]): HeatAssignment[] {
  if (round.blockedBy) {
    throw new RuleIncompleteError(round.blockedBy.openQuestion, round.source, round.blockedBy.detail)
  }

  if (orderedAthleteIds.length === 0) return []

  // Size-driven rounds (qualification, level B) use the capacity-aware fill so
  // a short heat lands at the slow end of the seeding (Q4, heats.ts).
  const heats =
    round.heats === "by_field_size"
      ? distributeIntoHeatsOfSize(orderedAthleteIds, round.athletesPerHeat ?? 1)
      : distributeSerpentine(orderedAthleteIds, round.heats)

  return heats
    .map((athleteIds, index) => ({ heatNumber: index + 1, athleteIds }))
    .filter((heat) => heat.athleteIds.length > 0)
}

/** Whether an official start list may be generated for this round. */
export function mayGenerateOfficially(round: RoundSpec): boolean {
  return round.blockedBy === undefined
}

// ---------------------------------------------------------------------------
// Advancement
// ---------------------------------------------------------------------------

/** One athlete's result within a heat, as approved by officials. */
export interface HeatResult {
  readonly heatNumber: number
  readonly athleteId: string
  /** Position within the heat, 1-based. */
  readonly positionInHeat: number
  /** Finishing time in centiseconds, or `null` for a non-finisher. */
  readonly timeCentiseconds: number | null
}

export interface AdvancementResult {
  /** Advancing athletes, in the seed order the next round should use. */
  readonly advancing: readonly string[]
  /** Athletes who did not advance, best first. */
  readonly eliminated: readonly string[]
  readonly basis: AdvanceRule["kind"]
}

/**
 * Computes who advances out of a completed round.
 *
 * Only APPROVED results may be passed here — the caller is responsible for that
 * gate. Advancement order matters: it becomes the next round's seeding, which
 * the official nested tables assume is "all heat winners by heat number, then
 * all runners-up by heat number" (verified in heats.test.ts).
 */
export function computeAdvancement(round: RoundSpec, results: readonly HeatResult[]): AdvancementResult {
  switch (round.advance.kind) {
    case "heat_positions": {
      const advancing: string[] = []
      // Group by requested position so winners come before runners-up, each
      // ordered by heat number. This is the order the nested tables encode.
      // Two athletes sharing a place both hold it (Q6).
      for (const position of round.advance.positions) {
        const atPosition = results
          .filter((r) => r.positionInHeat === position)
          .sort((a, b) => a.heatNumber - b.heatNumber)
        advancing.push(...atPosition.map((r) => r.athleteId))
      }
      return {
        advancing,
        eliminated: ids(orderByTime(results.filter((r) => !advancing.includes(r.athleteId)))),
        basis: round.advance.kind,
      }
    }

    case "heat_winners_plus_times": {
      const winners = results
        .filter((r) => r.positionInHeat === 1)
        .sort((a, b) => a.heatNumber - b.heatNumber)
      const winnerIds = new Set(winners.map((r) => r.athleteId))
      const rest = orderByTime(results.filter((r) => !winnerIds.has(r.athleteId)))
      const extra =
        round.advance.fillTo === undefined ? round.advance.additionalByTime : Math.max(0, round.advance.fillTo - winners.length)
      const taken = takeWithTies(rest, extra)
      return {
        advancing: [...winners.map((r) => r.athleteId), ...ids(rest.slice(0, taken))],
        eliminated: ids(rest.slice(taken)),
        basis: round.advance.kind,
      }
    }

    case "fastest_times": {
      const ordered = orderByTime(results)
      const taken = takeWithTies(ordered, round.advance.count)
      return {
        advancing: ids(ordered.slice(0, taken)),
        eliminated: ids(ordered.slice(taken)),
        basis: round.advance.kind,
      }
    }

    case "final":
      return { advancing: [], eliminated: [], basis: round.advance.kind }
  }
}

const ids = (results: readonly HeatResult[]): string[] => results.map((r) => r.athleteId)

/**
 * Orders results by time, fastest first. Athletes with no time (DNS, DNF, DQ,
 * FS) go to the bottom of the ranking (federation answer to Q3), in heat and
 * position order. Equal times keep their input order.
 */
function orderByTime(results: readonly HeatResult[]): HeatResult[] {
  return [...results].sort((a, b) => {
    if (a.timeCentiseconds === null && b.timeCentiseconds === null) {
      return a.heatNumber - b.heatNumber || a.positionInHeat - b.positionInHeat
    }
    if (a.timeCentiseconds === null) return 1
    if (b.timeCentiseconds === null) return -1
    return a.timeCentiseconds - b.timeCentiseconds
  })
}

/**
 * How many of `ordered` make the cut of `n`. Athletes with the same time share
 * the rank (federation answer to Q6), so a tie on the last qualifying place
 * takes everyone tied through.
 */
export function takeWithTies(ordered: readonly HeatResult[], n: number): number {
  if (n <= 0) return 0
  let taken = Math.min(n, ordered.length)
  const last = ordered[taken - 1]?.timeCentiseconds
  if (last === null || last === undefined) return taken
  while (taken < ordered.length && ordered[taken]!.timeCentiseconds === last) taken++
  return taken
}

// ---------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------

/**
 * Whether a round may be activated, given which rounds have approved results.
 *
 * `يتأهل إلى دور ال16 أول 16 لاعب ... في جولة التصفيات` — a later round depends
 * on its predecessor's approved results. A final must never open while its semi
 * is unapproved.
 */
export function canActivateRound(
  round: RoundSpec,
  approvedRoundIds: readonly string[]
): { readonly allowed: true } | { readonly allowed: false; readonly missing: readonly string[] } {
  const missing = round.prerequisites.filter((id) => !approvedRoundIds.includes(id))
  return missing.length === 0 ? { allowed: true } : { allowed: false, missing }
}

/**
 * Validates that a bracket's prerequisite graph is acyclic and well-formed.
 * Run when a bracket or event configuration is saved.
 */
export function validatePrerequisiteGraph(bracket: BracketDefinition): void {
  const rounds = [...bracket.rounds, ...(bracket.levelB ? [bracket.levelB] : [])]
  const byId = new Map(rounds.map((r) => [r.id, r]))

  // "qualification" is an external prerequisite for the League and Cup brackets.
  const known = new Set([...byId.keys(), "qualification"])
  for (const round of rounds) {
    for (const prerequisite of round.prerequisites) {
      if (!known.has(prerequisite)) {
        throw new Error(
          `Round '${round.id}' of ${bracket.championship}/${bracket.race} requires unknown round '${prerequisite}'.`
        )
      }
    }
  }

  const state = new Map<string, "visiting" | "done">()
  const visit = (id: string, path: readonly string[]): void => {
    if (state.get(id) === "done") return
    if (state.get(id) === "visiting") {
      throw new Error(`Prerequisite cycle in ${bracket.championship}/${bracket.race}: ${[...path, id].join(" -> ")}`)
    }
    state.set(id, "visiting")
    for (const prerequisite of byId.get(id)?.prerequisites ?? []) {
      visit(prerequisite, [...path, id])
    }
    state.set(id, "done")
  }
  for (const round of rounds) visit(round.id, [])
}
