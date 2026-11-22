/**
 * Season 2026-2027 ruleset.
 *
 * Transcribed verbatim from `2026-2027.docx` (لوائح مسابقات نشاط سباقات السرعة
 * موسم 2026-2027). Every value below is a FACT from the source document — see
 * docs/rules/RULE_MATRIX.md for the article and table reference of each.
 *
 * This file is season-scoped on purpose. The 2025-26 season used entirely
 * different birth-year boundaries (`شباب (2008-2009)`, `ناشئين (2010-2011)`),
 * so boundaries must never be hardcoded globally: adding a new season must not
 * change a past season's published results.
 */

import type { SeasonRuleset } from "../types"

/** Article 3, Table 1 — age categories by birth year. */
export const SEASON_2026_2027: SeasonRuleset = {
  season: "2026-2027",
  version: "2026-2027.r1",

  categories: [
    // `مواليد 2008 وما قبلها` — 2008 and earlier, open-ended.
    { id: "senior", nameAr: "عمومي", nameEn: "Senior", birthYearFrom: null, birthYearTo: 2008 },
    { id: "junior", nameAr: "شباب", nameEn: "Junior", birthYearFrom: 2009, birthYearTo: 2010 },
    { id: "youth", nameAr: "ناشئين", nameEn: "Youth", birthYearFrom: 2011, birthYearTo: 2012 },
    { id: "cadet14", nameAr: "تحت 14", nameEn: "Cadet 14", birthYearFrom: 2013, birthYearTo: 2013 },
    { id: "cadet13", nameAr: "تحت 13", nameEn: "Cadet 13", birthYearFrom: 2014, birthYearTo: 2014 },
    { id: "cadet12", nameAr: "تحت 12", nameEn: "Cadet 12", birthYearFrom: 2015, birthYearTo: 2015 },
    { id: "precadet11", nameAr: "تحت 11", nameEn: "Pre-cadet 11", birthYearFrom: 2016, birthYearTo: 2016 },
    { id: "precadet10", nameAr: "تحت 10", nameEn: "Pre-cadet 10", birthYearFrom: 2017, birthYearTo: 2017 },
    { id: "precadet9", nameAr: "تحت 9", nameEn: "Pre-cadet 9", birthYearFrom: 2018, birthYearTo: 2018 },
    // `مواليد 2019 و ما بعدها` — 2019 and later, open-ended.
    { id: "mini8", nameAr: "تحت 8", nameEn: "Mini 8", birthYearFrom: 2019, birthYearTo: null },
  ],

  /**
   * Article 5, Table 3 — points for positions 1..8 by category.
   * Positions 9 and beyond score nothing.
   */
  points: {
    senior: [100, 90, 80, 75, 70, 65, 60, 55],
    junior: [80, 72, 64, 60, 56, 52, 48, 44],
    youth: [60, 54, 48, 44, 41, 38, 35, 32],
    cadet14: [50, 45, 42, 38, 36, 32, 30, 27],
    cadet13: [50, 45, 42, 38, 36, 32, 30, 27],
    cadet12: [50, 45, 42, 38, 36, 32, 30, 27],
    precadet11: [40, 36, 32, 28, 26, 24, 22, 20],
    precadet10: [40, 36, 32, 28, 26, 24, 22, 20],
    precadet9: [40, 36, 32, 28, 26, 24, 22, 20],
    mini8: [40, 36, 32, 28, 26, 24, 22, 20],
  },

  /**
   * Article 5: `يبدأ احتساب النقاط للاعبين في أي مرحلة عندما يكون هناك 3 لاعبين
   * أو أكثر في المرحلة` — points begin when a category has 3 or more athletes.
   */
  minimumAthletesForPoints: 3,

  /**
   * OPEN — Q6. Article 5 says tied athletes receive points `بالتساوي`
   * (equally), but is silent on whether the shared position consumes the
   * following position(s). Defaults to standard sporting practice (it does);
   * any race containing a tie is flagged and blocked from official publication
   * until the federation confirms.
   */
  tieConsumesPositions: true,

  /**
   * Article 9 (first), Table 9 — athletes per heat in the qualification round.
   * The same sizes apply to level B in the League and Cup (Article 9 second).
   *
   * Long-distance races are absent deliberately: they are mass-start packs with
   * no heats (`يسمح بمشاركة جميع اللاعبين المسجلين` — no qualification).
   */
  heatSizes: {
    "100m": 2,
    one_lap: 4,
    "200m": 1,
    "500m": 4,
    middle: 4,
  },

  /**
   * Article 8: `البطولات التي يتم احتساب فيها ترتيب الأندية هي: بطولة الدوري
   * العام، بطولة كأس مصر` — the qualification round is explicitly excluded.
   */
  clubStandingsChampionships: ["national_league", "egypt_cup"],
}

/** Rulesets by season. Past seasons are added here, never by editing an existing one. */
export const RULESETS: Readonly<Record<string, SeasonRuleset>> = {
  "2026-2027": SEASON_2026_2027,
}

export function getRuleset(season: string): SeasonRuleset {
  const ruleset = RULESETS[season]
  if (!ruleset) {
    throw new Error(
      `No ruleset defined for season '${season}'. Rules are season-scoped; ` +
        `add a ruleset rather than reusing another season's.`
    )
  }
  return ruleset
}
