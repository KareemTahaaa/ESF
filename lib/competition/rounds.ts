/**
 * Turns a row of the season race catalogue into the rounds it contains.
 *
 * A catalogue row is a race session, not a round: row 7 runs the 800/1000m
 * round of 24, the semi-final and level B on one day. The round is the unit
 * the database tracks (status, deadline, entries, prerequisites), so each row
 * expands to one or more rounds here, using the bracket definitions in
 * rules/progression.ts. Row-to-round mapping: docs/rules/RULE_MATRIX.md §7, §9.
 */

import catalogue from "./data/race-catalogue-2026-2027.json"
import { checkEligibility, type EligibilityOptions } from "./rules/eligibility"
import { BRACKETS, QUALIFICATION_ROUNDS, type RoundSpec } from "./rules/progression"
import type { CategoryId, Championship, RaceCode, SeasonRuleset } from "./rules/types"

export interface CatalogueRow {
  readonly number: number
  readonly championship: Championship
  readonly championshipAr: string
  readonly venueAr: string
  readonly surface: "track" | "road"
  readonly raceAr: string
  readonly ruleAr: string
}

export const RACE_CATALOGUE_2026_2027 = catalogue.races as readonly CatalogueRow[]

/** Identifies a round across events: the prerequisite of a League R16 is the Qualifications round of the same race. */
export interface RoundRef {
  readonly championship: Championship
  readonly race: RaceCode
  readonly roundKey: string
}

export interface PlannedRound {
  readonly catalogueNumber: number
  readonly championship: Championship
  readonly race: RaceCode
  readonly roundKey: string
  readonly nameAr: string
  /** `registration`: clubs enter athletes. `advancement`: the field comes from earlier rounds. */
  readonly entryMode: "registration" | "advancement"
  readonly eligibleCategories: readonly CategoryId[]
  readonly prerequisites: readonly RoundRef[]
  /** Set when the round cannot produce official output yet (open rule question). */
  readonly blockedBy?: { readonly openQuestion: string; readonly detail: string }
  /** Source-conflict flags raised by eligibility (e.g. Q11). */
  readonly flags: readonly string[]
}

/**
 * Which race and which bracket rounds each catalogue row holds.
 * Rows 15-18 are long-distance races: a single direct-entry race, no bracket.
 */
const ROW_CONTENT: Readonly<Record<number, { readonly race: RaceCode; readonly rounds: readonly string[] }>> = {
  1: { race: "200m", rounds: ["qualification"] },
  2: { race: "500m", rounds: ["qualification"] },
  3: { race: "middle", rounds: ["qualification"] },
  4: { race: "100m", rounds: ["qualification"] },
  5: { race: "one_lap", rounds: ["qualification"] },
  6: { race: "500m", rounds: ["r16", "level_b"] },
  7: { race: "middle", rounds: ["r24", "sf", "level_b"] },
  8: { race: "100m", rounds: ["r16", "level_b"] },
  9: { race: "one_lap", rounds: ["r16", "level_b"] },
  10: { race: "200m", rounds: ["final", "level_b"] },
  11: { race: "500m", rounds: ["sf", "final"] },
  12: { race: "middle", rounds: ["final"] },
  13: { race: "100m", rounds: ["qf", "sf", "final_a", "final_b"] },
  14: { race: "one_lap", rounds: ["sf", "final"] },
  15: { race: "points_5000_track", rounds: ["race"] },
  16: { race: "elimination_10000_track", rounds: ["race"] },
  17: { race: "points_10000_road", rounds: ["race"] },
  18: { race: "elimination_15000_road", rounds: ["race"] },
  19: { race: "middle", rounds: ["r24", "r12", "level_b"] },
  20: { race: "100m", rounds: ["r16", "level_b"] },
  21: { race: "one_lap", rounds: ["r16", "level_b"] },
  22: { race: "middle", rounds: ["final"] },
  23: { race: "100m", rounds: ["qf", "sf", "final_a", "final_b"] },
  24: { race: "one_lap", rounds: ["sf", "final"] },
}

const LONG_DISTANCE_NAMES: Readonly<Partial<Record<RaceCode, string>>> = {
  points_5000_track: "5000m Track Points",
  elimination_10000_track: "10000m Track Elimination",
  points_10000_road: "10000m Road Points",
  elimination_15000_road: "15000m Road Elimination",
}

export function catalogueRow(number: number): CatalogueRow {
  const row = RACE_CATALOGUE_2026_2027.find((r) => r.number === number)
  if (!row) throw new Error(`Catalogue row ${number} does not exist in Races 2026-2027.docx.`)
  return row
}

function findSpec(championship: Championship, race: RaceCode, roundKey: string): RoundSpec {
  const brackets = championship === "qualifications" ? QUALIFICATION_ROUNDS : BRACKETS
  const bracket = brackets.find((b) => b.championship === championship && b.race === race)
  const spec = bracket && [...bracket.rounds, ...(bracket.levelB ? [bracket.levelB] : [])].find((r) => r.id === roundKey)
  if (!spec) throw new Error(`No round '${roundKey}' defined for ${championship} / ${race}.`)
  return spec
}

/** Expands a catalogue row into its rounds, with eligibility computed from Article 7. */
export function planRounds(number: number, ruleset: SeasonRuleset, options: EligibilityOptions = {}): PlannedRound[] {
  const row = catalogueRow(number)
  const content = ROW_CONTENT[number]
  if (!content) throw new Error(`Catalogue row ${number} has no round mapping.`)

  const flags = new Set<string>()
  const eligibleCategories = ruleset.categories
    .map((c) => c.id)
    .filter((id) => {
      const result = checkEligibility(row.championship, content.race, id, options)
      if (result.eligible) result.flags.forEach((f) => flags.add(f))
      return result.eligible
    })

  if (content.rounds[0] === "race") {
    return [
      {
        catalogueNumber: number,
        championship: row.championship,
        race: content.race,
        roundKey: "race",
        nameAr: LONG_DISTANCE_NAMES[content.race] ?? content.race,
        entryMode: "registration",
        eligibleCategories,
        prerequisites: [],
        flags: [...flags],
      },
    ]
  }

  return content.rounds.map((roundKey) => {
    const spec = findSpec(row.championship, content.race, roundKey)
    return {
      catalogueNumber: number,
      championship: row.championship,
      race: content.race,
      roundKey,
      nameAr: spec.nameAr,
      entryMode: roundKey === "qualification" ? "registration" : "advancement",
      eligibleCategories,
      // `qualification` always refers to the Qualifications championship's round.
      prerequisites: spec.prerequisites.map((key) => ({
        championship: key === "qualification" ? "qualifications" : row.championship,
        race: content.race,
        roundKey: key,
      })),
      ...(spec.blockedBy ? { blockedBy: spec.blockedBy } : {}),
      flags: [...flags],
    }
  })
}

/** Human label for a race code, in the official mixed Arabic/Latin terminology. */
export function raceLabel(race: RaceCode, category?: CategoryId): string {
  switch (race) {
    case "100m":
      return "100m"
    case "one_lap":
      return "One Lap"
    case "200m":
      return "200m"
    case "500m":
      return "500m"
    case "middle":
      return category ? (["precadet11", "precadet10", "precadet9", "mini8"].includes(category) ? "800m" : "1000m") : "800/1000m"
    case "points_5000_track":
      return "5000m نقاط"
    case "points_10000_road":
      return "10000m نقاط"
    case "elimination_10000_track":
      return "10000m إقصاء"
    case "elimination_15000_road":
      return "15000m إقصاء"
    case "relay_3000":
      return "تتابع 3000m"
  }
}

/**
 * The round whose club entries decide this round's field (Q12, federation
 * answer of 2026-11-03): the first League / Cup round after the Qualifications
 * is registered for, and its level B uses the same entries. Null for rounds
 * filled automatically from results, and for ordinary registration rounds.
 * Mirrors entry_round_for() in supabase/migrations/0009.
 */
export function entryRoundKey(championship: Championship, race: RaceCode, roundKey: string): string | null {
  if (championship === "qualifications") return null
  const bracket = BRACKETS.find((b) => b.championship === championship && b.race === race)
  const first = bracket?.rounds.find((r) => r.prerequisites.includes("qualification"))
  if (!first) return null
  if (roundKey === first.id) return first.id
  if (roundKey === "level_b" && bracket?.levelB?.prerequisites.includes("qualification")) return first.id
  return null
}

/** Whether clubs register athletes for this round although its field comes from the Qualifications. */
export function takesQualifiedEntries(championship: Championship, race: RaceCode, roundKey: string): boolean {
  return roundKey !== "level_b" && entryRoundKey(championship, race, roundKey) === roundKey
}
