/**
 * Shared domain types for the speed-skating competition rules engine.
 *
 * Every rule function in this directory is a pure function of its inputs and an
 * explicit ruleset version: no database access, no randomness, no clock reads.
 * That is what makes recalculation reproducible and keeps a future rule change
 * from silently altering a past season's published results.
 *
 * Rule sources are cited as `Article N` of `2026-2027.docx` or by catalogue row
 * of `Races 2026-2027.docx`. See docs/rules/RULE_MATRIX.md.
 */

/** Official age-category identifiers. Stable keys; display names live in the ruleset. */
export type CategoryId =
  | "senior"
  | "junior"
  | "youth"
  | "cadet14"
  | "cadet13"
  | "cadet12"
  | "precadet11"
  | "precadet10"
  | "precadet9"
  | "mini8"

export type Gender = "M" | "F"

/** The three official championships of Article 4. */
export type Championship = "qualifications" | "national_league" | "egypt_cup"

/** Track or Road, as the sources distinguish them. Never normalised away. */
export type RaceSurface = "track" | "road"

/**
 * Race codes as the legacy data and the regulations name them.
 * `middle` covers the single `800m-1000m` race whose distance is chosen by
 * category (Article 7: `تحت 11` and below skate 800m, `تحت 12` and above 1000m).
 */
export type RaceCode =
  | "100m"
  | "one_lap"
  | "200m"
  | "500m"
  | "middle"
  | "points_5000_track"
  | "points_10000_road"
  | "elimination_10000_track"
  | "elimination_15000_road"
  | "relay_3000"

/** Classification level of Article 9 (second): `مستوى التصنيف الأول/الثاني`. */
export type ClassificationLevel = "A" | "B"

/**
 * Result status. `FS` and `DQ` are present in the legacy `Records` data.
 *
 * The regulations define no DNS/DNF/DQ/FS handling for points or advancement
 * (OPEN_QUESTIONS Q3), so a non-`ok` status blocks official points publication
 * for its race rather than being silently scored.
 */
export type ResultStatus = "ok" | "dns" | "dnf" | "dq" | "fs" | "unknown"

/** One age category's definition within a season ruleset. */
export interface CategoryDefinition {
  readonly id: CategoryId
  /** Official Arabic name, e.g. `عمومي`. */
  readonly nameAr: string
  /** Official English name, e.g. `Senior`. */
  readonly nameEn: string
  /**
   * Earliest birth year in the category, or `null` for the open-ended oldest
   * category (`عمومي` is "2008 and earlier").
   */
  readonly birthYearFrom: number | null
  /**
   * Latest birth year in the category, or `null` for the open-ended youngest
   * category (`تحت 8` is "2019 and later").
   */
  readonly birthYearTo: number | null
}

/**
 * The Article 5 points table: points for finishing positions 1..8.
 * Index 0 is first place. Positions beyond the array score nothing.
 */
export type PointsRow = readonly number[]

export interface SeasonRuleset {
  /** Season identifier, e.g. `2026-2027`. */
  readonly season: string
  /**
   * Ruleset version, recorded against every calculation so a result can be
   * explained by the exact rules that produced it.
   */
  readonly version: string
  /** Article 3, ordered oldest category first. */
  readonly categories: readonly CategoryDefinition[]
  /** Article 5, points by category and finishing position. */
  readonly points: Readonly<Record<CategoryId, PointsRow>>
  /** Article 5: points are awarded only when a category has at least this many athletes. */
  readonly minimumAthletesForPoints: number
  /**
   * Article 5 ties: athletes sharing a position each receive that position's
   * full points, and the following position is skipped — the federation's
   * answer to OPEN_QUESTIONS Q6 (2026-11-03).
   */
  readonly tieConsumesPositions: boolean
  /** Article 9 Table 9 / Article 9 (second) §8.2: athletes per heat by race. */
  readonly heatSizes: Readonly<Partial<Record<RaceCode, number>>>
  /** Championships for which club standings are computed (Article 8). */
  readonly clubStandingsChampionships: readonly Championship[]
}

/** A category assignment outcome. Unresolved is a first-class result, not an error. */
export type CategoryAssignment =
  | { readonly resolved: true; readonly category: CategoryDefinition }
  | { readonly resolved: false; readonly reason: UnresolvedCategoryReason }

export type UnresolvedCategoryReason =
  /** No birth year on record — 16 athletes in the legacy data (Q14). */
  | "birth_year_missing"
  /** Birth year present but implausible; never silently coerced. */
  | "birth_year_invalid"
  /** Birth year falls in no category of this ruleset — a ruleset defect. */
  | "no_matching_category"

/**
 * Raised when a rule cannot be applied because the source document is
 * incomplete or the rule does not exist. Carries the open-question reference so
 * a blocked calculation always names what blocks it.
 */
export class RuleIncompleteError extends Error {
  readonly openQuestion: string
  readonly ruleReference: string

  constructor(openQuestion: string, ruleReference: string, detail: string) {
    super(
      `Rule incomplete (${openQuestion}): ${detail}. Source: ${ruleReference}. ` +
        `Federation confirmation required before official use — see docs/rules/OPEN_QUESTIONS.md.`
    )
    this.name = "RuleIncompleteError"
    this.openQuestion = openQuestion
    this.ruleReference = ruleReference
  }
}
