/**
 * Article 3 age-category tests.
 *
 * Covers every birth-year boundary in the 2026-2027 table, both open-ended
 * ends, and every unresolved case. Boundary coverage is mandatory: an off-by-one
 * here silently moves athletes between categories, which changes both their
 * eligible distances (Article 7) and their points table (Article 5).
 */

import { describe, expect, it } from "vitest"
import { assignCategory, findCategoryByArabicName, getCategory } from "../rules/age-category"
import { SEASON_2026_2027, getRuleset } from "../rules/rulesets/season-2026-2027"
import type { CategoryId } from "../rules/types"

const ruleset = SEASON_2026_2027

function categoryOf(birthYear: number | null | undefined): CategoryId | string {
  const result = assignCategory(birthYear, ruleset)
  return result.resolved ? result.category.id : `unresolved:${result.reason}`
}

describe("assignCategory — Article 3, Table 1", () => {
  it("assigns every birth year listed in the official table", () => {
    // Exact table transcription: birth year -> expected category.
    const table: ReadonlyArray<readonly [number, CategoryId]> = [
      [2008, "senior"],
      [2009, "junior"],
      [2010, "junior"],
      [2011, "youth"],
      [2012, "youth"],
      [2013, "cadet14"],
      [2014, "cadet13"],
      [2015, "cadet12"],
      [2016, "precadet11"],
      [2017, "precadet10"],
      [2018, "precadet9"],
      [2019, "mini8"],
    ]
    for (const [year, expected] of table) {
      expect(categoryOf(year), `birth year ${year}`).toBe(expected)
    }
  })

  // Each pair is the last year of one category and the first of the next.
  // These are the only places an off-by-one can hide.
  it.each([
    [2008, "senior", 2009, "junior"],
    [2010, "junior", 2011, "youth"],
    [2012, "youth", 2013, "cadet14"],
    [2013, "cadet14", 2014, "cadet13"],
    [2014, "cadet13", 2015, "cadet12"],
    [2015, "cadet12", 2016, "precadet11"],
    [2016, "precadet11", 2017, "precadet10"],
    [2017, "precadet10", 2018, "precadet9"],
    [2018, "precadet9", 2019, "mini8"],
  ])("boundary %i=%s / %i=%s", (lastYear, lastCat, firstYear, firstCat) => {
    expect(categoryOf(lastYear as number)).toBe(lastCat)
    expect(categoryOf(firstYear as number)).toBe(firstCat)
  })

  it("treats عمومي as open-ended for earlier years (مواليد 2008 وما قبلها)", () => {
    // Real legacy data contains athletes born 2001 and 2005.
    for (const year of [2007, 2006, 2005, 2001, 1990, 1950, 1900]) {
      expect(categoryOf(year), `birth year ${year}`).toBe("senior")
    }
  })

  it("treats تحت 8 as open-ended for later years (مواليد 2019 و ما بعدها)", () => {
    for (const year of [2019, 2020, 2024, 2030, 2100]) {
      expect(categoryOf(year), `birth year ${year}`).toBe("mini8")
    }
  })

  it("covers every birth year from 1900 to 2100 with exactly one category", () => {
    for (let year = 1900; year <= 2100; year++) {
      const result = assignCategory(year, ruleset)
      expect(result.resolved, `birth year ${year} must resolve`).toBe(true)
      // No year may match two categories — ranges must not overlap.
      const matches = ruleset.categories.filter(
        (c) =>
          (c.birthYearFrom === null || year >= c.birthYearFrom) &&
          (c.birthYearTo === null || year <= c.birthYearTo)
      )
      expect(matches, `birth year ${year} matched ${matches.length} categories`).toHaveLength(1)
    }
  })
})

describe("assignCategory — unresolved cases", () => {
  it("reports a missing birth year rather than guessing", () => {
    // 16 of the 777 legacy athletes are in exactly this state (Q14).
    expect(categoryOf(null)).toBe("unresolved:birth_year_missing")
    expect(categoryOf(undefined)).toBe("unresolved:birth_year_missing")
  })

  it("rejects implausible birth years instead of coercing to an open-ended category", () => {
    // Without plausibility bounds, 1098 would silently become عمومي and 2205 تحت 8.
    expect(categoryOf(1098)).toBe("unresolved:birth_year_invalid")
    expect(categoryOf(2205)).toBe("unresolved:birth_year_invalid")
    expect(categoryOf(0)).toBe("unresolved:birth_year_invalid")
    expect(categoryOf(-2010)).toBe("unresolved:birth_year_invalid")
  })

  it("rejects non-integer birth years", () => {
    expect(categoryOf(2010.5)).toBe("unresolved:birth_year_invalid")
    expect(categoryOf(Number.NaN)).toBe("unresolved:birth_year_invalid")
    expect(categoryOf(Number.POSITIVE_INFINITY)).toBe("unresolved:birth_year_invalid")
  })
})

describe("category lookup", () => {
  it("exposes the official Arabic and English names", () => {
    expect(getCategory("senior", ruleset).nameAr).toBe("عمومي")
    expect(getCategory("senior", ruleset).nameEn).toBe("Senior")
    expect(getCategory("junior", ruleset).nameAr).toBe("شباب")
    expect(getCategory("youth", ruleset).nameAr).toBe("ناشئين")
    expect(getCategory("cadet14", ruleset).nameAr).toBe("تحت 14")
    expect(getCategory("mini8", ruleset).nameAr).toBe("تحت 8")
  })

  it("throws on an unknown category id rather than returning a fallback", () => {
    expect(() => getCategory("bogus" as CategoryId, ruleset)).toThrow(/not defined in ruleset/)
  })

  it("resolves official Arabic names, tolerating surrounding whitespace", () => {
    expect(findCategoryByArabicName("عمومي", ruleset)?.id).toBe("senior")
    expect(findCategoryByArabicName("  تحت 13  ", ruleset)?.id).toBe("cadet13")
  })

  it("does not accept another season's label vocabulary", () => {
    // 2025-26 legacy labels. These must be mapped by the import layer's
    // season-scoped table, not silently matched here.
    expect(findCategoryByArabicName("شباب (2008-2009)", ruleset)).toBeUndefined()
    expect(findCategoryByArabicName("صاعدين 14 (2012)", ruleset)).toBeUndefined()
    expect(findCategoryByArabicName("أشبال 11 (2015)", ruleset)).toBeUndefined()
  })
})

describe("ruleset selection is season-scoped", () => {
  it("returns the 2026-2027 ruleset by season", () => {
    expect(getRuleset("2026-2027").version).toBe("2026-2027.r1")
  })

  it("refuses to fall back to another season's rules", () => {
    // 2025-26 used different boundaries; silently reusing 2026-27 would
    // retroactively recategorise published results.
    expect(() => getRuleset("2025-2026")).toThrow(/No ruleset defined/)
  })

  it("defines a points row for every category", () => {
    for (const category of ruleset.categories) {
      const row = ruleset.points[category.id]
      expect(row, `points row for ${category.id}`).toBeDefined()
      expect(row).toHaveLength(8)
    }
  })
})
