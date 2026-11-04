/**
 * Seeding from the previous season — Article 9 (first), Table 9.
 *
 * `يتم تقسيم جميع اللاعبين المسجلين في كل مرحلة إلى heats من N لاعبين بناء على
 * نتائج اللاعبين لنفس المسافة في الدوري العام الموسم الماضي`
 *
 * Heats are seeded on the athlete's previous-season NATIONAL LEAGUE result AT
 * THE SAME DISTANCE. Note this is per-distance, not a single overall ranking:
 * the brief describes "the previous season's ranking", but the regulations are
 * narrower and they govern. See docs/rules/RULE_MATRIX.md §6.
 *
 * The legacy `GenerateStartLists` macro shuffles athletes randomly into heats
 * (`ShuffleArray`, `Randomize`). That contradicts this rule and is deliberately
 * NOT reproduced — see docs/phase-2/SOURCE_MATERIALS_INVENTORY.md §4.3.
 * Seeding here is fully deterministic: the same inputs always give the same
 * start list, which is what makes a published start list defensible.
 */

import type { RaceCode } from "./types"

export interface SeedingCandidate {
  readonly athleteId: string
  /** Federation number (`الرقم`) — the deterministic tiebreak for unranked athletes. */
  readonly federationNumber: number
  /**
   * Previous-season National League rank at this distance, or `null` when the
   * athlete has none. Roughly a third of the legacy field is unranked, plus
   * every newly registered athlete, so `null` is the normal case not an error.
   */
  readonly previousRank: number | null
  /**
   * Set when the source ranking value could not be trusted — e.g. the 138
   * `Heat N` strings in `ترتيب 800m-1000m Track Cup` (OPEN_QUESTIONS Q2).
   * Such an athlete is seeded as unranked and the race is flagged.
   */
  readonly rankNeedsReview?: boolean
  /** The raw source value, retained for the flag message. */
  readonly rankRaw?: string
}

export type SeedingBasis =
  /** Seeded on a previous-season National League rank at this distance. */
  | "previous_rank"
  /** No previous-season rank — placed after all ranked athletes (Q7). */
  | "unranked"
  /** Source ranking was unusable; treated as unranked and flagged (Q2). */
  | "rank_unusable"

export interface SeededAthlete {
  readonly athleteId: string
  /** 1-based seed position. Seed 1 is the best-ranked athlete. */
  readonly seed: number
  readonly basis: SeedingBasis
  readonly previousRank: number | null
}

export interface SeedingFlag {
  readonly openQuestion: string
  readonly detail: string
}

export interface SeedingResult {
  readonly race: RaceCode
  readonly seeded: readonly SeededAthlete[]
  readonly rankedCount: number
  readonly unrankedCount: number
  /** Non-empty when an unresolved rule or unusable source data affects seeding. */
  readonly flags: readonly SeedingFlag[]
}

/**
 * Seeds a category's entrants for one race.
 *
 * Order:
 *  1. Athletes with a usable previous-season rank, best rank first.
 *  2. Everyone else, by federation number ascending.
 *
 * ASSUMPTION — OPEN_QUESTIONS Q7. The regulations do not address athletes with
 * no previous-season result. The brief says they are placed last, which is
 * applied here. Their order among themselves is undefined by both sources, so
 * federation number ascending is used: stable, reproducible, and explicitly not
 * a random draw.
 */
export function seedFromPreviousSeason(
  race: RaceCode,
  candidates: readonly SeedingCandidate[]
): SeedingResult {
  const flags: SeedingFlag[] = []

  const duplicateIds = findDuplicates(candidates.map((c) => c.athleteId))
  if (duplicateIds.length > 0) {
    throw new Error(`Cannot seed: duplicate athlete entries for ${duplicateIds.join(", ")}`)
  }

  const unusable = candidates.filter((c) => c.rankNeedsReview)
  if (unusable.length > 0) {
    flags.push({
      openQuestion: "Q2",
      detail:
        `${unusable.length} athlete(s) have an unusable previous-season ranking ` +
        `(e.g. ${unusable
          .slice(0, 3)
          .map((c) => `${c.athleteId}='${c.rankRaw ?? "?"}'`)
          .join(", ")}) and are seeded as unranked`,
    })
  }

  const ranked: SeedingCandidate[] = []
  const unranked: SeedingCandidate[] = []
  for (const candidate of candidates) {
    const usable = !candidate.rankNeedsReview && candidate.previousRank !== null
    if (usable) ranked.push(candidate)
    else unranked.push(candidate)
  }

  const duplicateRanks = findDuplicates(ranked.map((c) => String(c.previousRank)))
  if (duplicateRanks.length > 0) {
    // Two athletes cannot share a previous-season rank at one distance; this
    // means the imported ranking data is inconsistent.
    flags.push({
      openQuestion: "Q2",
      detail: `previous-season rank(s) ${duplicateRanks.join(", ")} are shared by more than one athlete`,
    })
  }

  // Ranked: best rank first. Federation number breaks any duplicate rank so the
  // order stays deterministic even with the inconsistent data flagged above.
  ranked.sort((a, b) => a.previousRank! - b.previousRank! || a.federationNumber - b.federationNumber)

  // Unranked: federation number ascending. Deterministic, never shuffled.
  unranked.sort((a, b) => a.federationNumber - b.federationNumber)

  if (unranked.length > 0) {
    flags.push({
      openQuestion: "Q7",
      detail:
        `${unranked.length} of ${candidates.length} athlete(s) have no usable previous-season ` +
        `National League result at this distance and are seeded last, ordered by federation number`,
    })
  }

  const seeded: SeededAthlete[] = [
    ...ranked.map((c) => ({
      athleteId: c.athleteId,
      seed: 0,
      basis: "previous_rank" as SeedingBasis,
      previousRank: c.previousRank,
    })),
    ...unranked.map((c) => ({
      athleteId: c.athleteId,
      seed: 0,
      basis: (c.rankNeedsReview ? "rank_unusable" : "unranked") as SeedingBasis,
      previousRank: null,
    })),
  ].map((entry, index) => ({ ...entry, seed: index + 1 }))

  return {
    race,
    seeded,
    rankedCount: ranked.length,
    unrankedCount: unranked.length,
    flags,
  }
}

/**
 * Selects the top N seeds into classification level A, with everyone else in
 * level B — Article 9 (second), `مستوى التصنيف الأول / الثاني`.
 *
 * Level A sizes: 16 for 100m, One Lap and 500m; 12 for 200m; 24 for 800/1000m.
 */
export function splitClassificationLevels(
  seeded: readonly SeededAthlete[],
  levelASize: number
): { levelA: readonly SeededAthlete[]; levelB: readonly SeededAthlete[] } {
  if (!Number.isInteger(levelASize) || levelASize < 1) {
    throw new Error(`Invalid level A size: ${levelASize}`)
  }
  return {
    levelA: seeded.slice(0, levelASize),
    levelB: seeded.slice(levelASize),
  }
}

/** Official level A sizes by race (Article 9 second; catalogue rows 1-5). */
export const LEVEL_A_SIZE: Readonly<Partial<Record<RaceCode, number>>> = {
  "100m": 16,
  one_lap: 16,
  "500m": 16,
  "200m": 12,
  middle: 24,
}

/** True when official seeding output may be published for this result. */
export function maySeedOfficially(result: SeedingResult): boolean {
  // Q7 (unranked athletes placed last) is a documented default rather than a
  // blocker: it is the normal case for roughly a third of the field, and
  // refusing to seed would make the system unusable. Q2 is a genuine data
  // defect and does block.
  return !result.flags.some((f) => f.openQuestion === "Q2")
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}
