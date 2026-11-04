/**
 * Race eligibility — Article 7 (المادة 7), Tables 5-8.
 *
 * Eligibility is evaluated PER DISTANCE. An athlete eligible for one distance
 * is not thereby eligible for another: the Cup runs no 200m at all, and the long
 * distances are restricted to the three oldest categories.
 *
 * Two category-dependent subtleties the tables encode:
 *
 *  1. The 800m/1000m split is by CATEGORY, not by race. `تحت 11` and below skate
 *     800m; `تحت 12` and above skate 1000m. The legacy data models both as one
 *     race (`800m-1000m`), so the actual distance must be resolved per athlete.
 *
 *  2. Long distances (points, elimination, relay) exist only for عمومي, شباب and
 *     ناشئين. Offering one to a Cadet is an eligibility error, not a UI detail.
 */

import type { CategoryId, Championship, RaceCode, SeasonRuleset } from "./types"

/** Categories in age order, oldest first — matches the ruleset ordering. */
const CATEGORY_ORDER: readonly CategoryId[] = [
  "senior",
  "junior",
  "youth",
  "cadet14",
  "cadet13",
  "cadet12",
  "precadet11",
  "precadet10",
  "precadet9",
  "mini8",
]

/** The three oldest categories, which alone skate the long distances. */
const LONG_DISTANCE_CATEGORIES: readonly CategoryId[] = ["senior", "junior", "youth"]

/** Categories that skate 800m rather than 1000m (`تحت 11` and below). */
const EIGHT_HUNDRED_CATEGORIES: readonly CategoryId[] = ["precadet11", "precadet10", "precadet9", "mini8"]

export type MiddleDistance = 800 | 1000

/**
 * Resolves the actual middle distance for a category.
 * Article 7: `تحت 11` and below skate 800m, `تحت 12` and above skate 1000m.
 */
export function middleDistanceFor(categoryId: CategoryId): MiddleDistance {
  return EIGHT_HUNDRED_CATEGORIES.includes(categoryId) ? 800 : 1000
}

/**
 * Long-distance categories.
 *
 * Q11, answered by the federation on 2026-11-03: عمومي, شباب and ناشئين are the
 * only categories in the long-distance races, and شباب and ناشئين race merged.
 * The race catalogue's `مراحل شباب و عمومي` (rows 15-18) is superseded. The
 * option remains only so tests can exercise the narrower reading.
 */
export interface EligibilityOptions {
  /** Whether ناشئين (Youth) may enter the long-distance races. Default true. */
  readonly youthInLongDistance?: boolean
}

export type IneligibilityReason =
  /** The championship does not run this race for any category. */
  | "race_not_in_championship"
  /** The race exists in this championship but not for this category. */
  | "category_not_permitted_for_race"
  /** Long-distance race and the category is below the permitted range. */
  | "category_below_long_distance_range"
  /** Relay has no implementable rule at all (Q10). */
  | "relay_not_implemented"

export type EligibilityResult =
  | { readonly eligible: true; readonly middleDistance?: MiddleDistance; readonly flags: readonly string[] }
  | { readonly eligible: false; readonly reason: IneligibilityReason; readonly detail: string }

/**
 * Races run by each championship, before category filtering.
 * Article 7: Table 5 (Qualifications), Tables 6-7 (National League), Table 8 (Cup).
 */
const CHAMPIONSHIP_RACES: Readonly<Record<Championship, readonly RaceCode[]>> = {
  // Table 5: Road 100m + One Lap; Track 200m, 500m, 1000m/800m.
  qualifications: ["100m", "one_lap", "200m", "500m", "middle"],
  // Tables 6-7: everything, including long distances and relay.
  national_league: [
    "100m",
    "one_lap",
    "200m",
    "500m",
    "middle",
    "points_10000_road",
    "elimination_15000_road",
    "points_5000_track",
    "elimination_10000_track",
    "relay_3000",
  ],
  // Table 8: Road 100m + One Lap; Track 1000m/800m ONLY. No 200m, no 500m.
  egypt_cup: ["100m", "one_lap", "middle"],
}

const LONG_DISTANCE_RACES: readonly RaceCode[] = [
  "points_10000_road",
  "elimination_15000_road",
  "points_5000_track",
  "elimination_10000_track",
]

/** Checks whether a category may enter a race in a championship. */
export function checkEligibility(
  championship: Championship,
  race: RaceCode,
  categoryId: CategoryId,
  options: EligibilityOptions = {}
): EligibilityResult {
  const races = CHAMPIONSHIP_RACES[championship]
  if (!races.includes(race)) {
    return {
      eligible: false,
      reason: "race_not_in_championship",
      detail: `${championship} does not run ${race} (Article 7)`,
    }
  }

  if (race === "relay_3000") {
    return {
      eligible: false,
      reason: "relay_not_implemented",
      detail:
        "relay has no team size, composition, eligibility, or scoring rule in any source " +
        "(see docs/rules/OPEN_QUESTIONS.md Q10)",
    }
  }

  if (LONG_DISTANCE_RACES.includes(race)) {
    const youthAllowed = options.youthInLongDistance ?? true
    const permitted = youthAllowed
      ? LONG_DISTANCE_CATEGORIES
      : LONG_DISTANCE_CATEGORIES.filter((c) => c !== "youth")

    if (!permitted.includes(categoryId)) {
      return {
        eligible: false,
        reason: "category_below_long_distance_range",
        detail:
          `${race} is restricted to ${permitted.join(", ")} (Article 7 Tables 6-7); ` +
          `${categoryId} may not enter`,
      }
    }

    return { eligible: true, flags: [] }
  }

  // Sprint and middle distances: every category of every championship that runs
  // them may enter (Tables 5, 6-7, 8 all list all ten categories).
  if (race === "middle") {
    return { eligible: true, middleDistance: middleDistanceFor(categoryId), flags: [] }
  }

  return { eligible: true, flags: [] }
}

/** All races a category may enter in a championship, in catalogue order. */
export function eligibleRaces(
  championship: Championship,
  categoryId: CategoryId,
  options: EligibilityOptions = {}
): readonly RaceCode[] {
  return CHAMPIONSHIP_RACES[championship].filter(
    (race) => checkEligibility(championship, race, categoryId, options).eligible
  )
}

/**
 * Validates a set of race entries for one athlete.
 *
 * An athlete may enter multiple DISTINCT distances where the rules allow it
 * (Article 2 / Article 7), but never the same race twice.
 */
export function validateAthleteEntries(
  championship: Championship,
  categoryId: CategoryId,
  races: readonly RaceCode[],
  options: EligibilityOptions = {}
): { readonly valid: true; readonly flags: readonly string[] } | { readonly valid: false; readonly errors: readonly string[] } {
  const errors: string[] = []
  const flags: string[] = []

  const seen = new Set<RaceCode>()
  for (const race of races) {
    if (seen.has(race)) {
      errors.push(`duplicate entry for ${race}`)
      continue
    }
    seen.add(race)

    const result = checkEligibility(championship, race, categoryId, options)
    if (!result.eligible) {
      errors.push(`${race}: ${result.detail}`)
    } else {
      flags.push(...result.flags)
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true, flags }
}

/** Category order index, for sorting start lists and score sheets by age group. */
export function categoryOrderIndex(categoryId: CategoryId): number {
  const index = CATEGORY_ORDER.indexOf(categoryId)
  if (index === -1) throw new Error(`Unknown category '${categoryId}'.`)
  return index
}

/**
 * Categories merged into one ranking group for a race.
 *
 * Article 9: long-distance races merge Youth and Junior
 * (`مع ضم المراحل السنية للناشئين والشباب`). Confirmed by the 2025-26
 * `10K Points Road` score sheet, where a ناشئين athlete appears under a block
 * headed شباب — so the merged group carries the SENIOR name of the two.
 */
export function mergedCategoriesFor(race: RaceCode, categoryId: CategoryId): {
  readonly groupCategoryId: CategoryId
  readonly mergedWith: readonly CategoryId[]
} {
  if (LONG_DISTANCE_RACES.includes(race) && (categoryId === "youth" || categoryId === "junior")) {
    return { groupCategoryId: "junior", mergedWith: ["junior", "youth"] }
  }
  return { groupCategoryId: categoryId, mergedWith: [categoryId] }
}

/** Validates that a ruleset covers every category this module knows about. */
export function assertRulesetCoversCategories(ruleset: SeasonRuleset): void {
  for (const categoryId of CATEGORY_ORDER) {
    if (!ruleset.categories.some((c) => c.id === categoryId)) {
      throw new Error(`Ruleset '${ruleset.version}' is missing category '${categoryId}'.`)
    }
  }
}
