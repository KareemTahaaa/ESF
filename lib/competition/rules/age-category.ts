/**
 * Age-category assignment — Article 3 (المادة 3) of the season regulations.
 *
 * `يتم تحديد المرحلة العمرية للاعبين طبقاً للجدول التالي` — an athlete's
 * category is determined solely by birth year against the season's table.
 *
 * Category is therefore DERIVED, never stored on the athlete: the same athlete
 * belongs to different categories in different seasons. See
 * docs/phase-2/DATA_MIGRATION_MAP.md §3.
 */

import type { CategoryAssignment, CategoryDefinition, CategoryId, SeasonRuleset } from "./types"

/**
 * Plausibility bounds for a birth year. A value outside these is rejected as
 * invalid rather than coerced into the open-ended oldest or youngest category,
 * which would silently mis-categorise a typo such as `1098` or `2205`.
 */
const MIN_PLAUSIBLE_BIRTH_YEAR = 1900
const MAX_PLAUSIBLE_BIRTH_YEAR = 2100

/**
 * Assigns an athlete to an age category for the given season.
 *
 * Returns an unresolved assignment rather than throwing when the birth year is
 * missing or implausible: 16 of the 777 legacy athletes have no birth year
 * (OPEN_QUESTIONS Q14), and they must surface as a blocking data issue rather
 * than crash an import or be guessed from their previous-season category.
 */
export function assignCategory(
  birthYear: number | null | undefined,
  ruleset: SeasonRuleset
): CategoryAssignment {
  if (birthYear === null || birthYear === undefined) {
    return { resolved: false, reason: "birth_year_missing" }
  }

  if (!Number.isInteger(birthYear) || birthYear < MIN_PLAUSIBLE_BIRTH_YEAR || birthYear > MAX_PLAUSIBLE_BIRTH_YEAR) {
    return { resolved: false, reason: "birth_year_invalid" }
  }

  for (const category of ruleset.categories) {
    const atOrAfterStart = category.birthYearFrom === null || birthYear >= category.birthYearFrom
    const atOrBeforeEnd = category.birthYearTo === null || birthYear <= category.birthYearTo
    if (atOrAfterStart && atOrBeforeEnd) {
      return { resolved: true, category }
    }
  }

  return { resolved: false, reason: "no_matching_category" }
}

/** Looks up a category definition by id, or throws — never returns a silent fallback. */
export function getCategory(id: CategoryId, ruleset: SeasonRuleset): CategoryDefinition {
  const category = ruleset.categories.find((c) => c.id === id)
  if (!category) {
    throw new Error(`Category '${id}' is not defined in ruleset '${ruleset.version}'.`)
  }
  return category
}

/**
 * Resolves an official Arabic category name to its id, for verifying imported
 * legacy data against the recomputed category.
 *
 * Matching is exact on the official name. Legacy label variants
 * (`صاعدين 14 (2012)`, `أشبال 11 (2015)`) are handled by the season-scoped
 * label mapping in the import layer, not here — this function must not quietly
 * accept another season's vocabulary.
 */
export function findCategoryByArabicName(
  nameAr: string,
  ruleset: SeasonRuleset
): CategoryDefinition | undefined {
  const trimmed = nameAr.trim()
  return ruleset.categories.find((c) => c.nameAr === trimmed)
}

/**
 * True when the athlete may be entered in races for this season.
 *
 * An athlete with no resolvable category is not entry-eligible: eligibility in
 * Article 7 is expressed per category, so without one no race can be checked.
 */
export function isCategoryResolved(assignment: CategoryAssignment): boolean {
  return assignment.resolved
}
