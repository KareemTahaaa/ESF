/**
 * Start-list generation for the rounds clubs register for: the Qualifications
 * round (Article 9 first, Table 9) and the long-distance races (Article 9).
 *
 * Pure and deterministic, like the rest of the rules engine: the same entries
 * and rankings always give the same start list, so a published list can be
 * reproduced and defended. Nothing is drawn at random (the legacy macro's
 * shuffle is deliberately not reproduced — see rules/seeding.ts).
 *
 * Layout conventions follow the federation's 2025-26 start-list workbook
 * (docs/phase-2/SOURCE_MATERIALS_INVENTORY.md §5): one event per category ×
 * gender, oldest category first, girls (بنات) before boys (بنين).
 */

import { mergedCategoriesFor } from "./rules/eligibility"
import { findRound, generateHeats, type HeatAssignment } from "./rules/progression"
import { maySeedOfficially, seedFromPreviousSeason, type SeedingFlag } from "./rules/seeding"
import { assignLanes } from "./rules/heats"
import { RuleIncompleteError, type CategoryId, type Championship, type Gender, type RaceCode, type SeasonRuleset } from "./rules/types"

export interface StartListEntrant {
  readonly athleteId: string
  readonly federationNumber: number
  readonly fullName: string
  readonly clubCode: string
  readonly clubName: string
  readonly categoryId: CategoryId
  readonly gender: Gender
}

/** Previous-season National League ranking at this distance (Article 9 Table 9). */
export interface PreviousRanking {
  readonly rank: number | null
  readonly rankRaw: string | null
  readonly needsReview: boolean
}

export interface StartListLane {
  readonly lane: number
  readonly seed: number | null
  readonly entrant: StartListEntrant
}

export interface StartListHeat {
  /** Null for a mass-start race with no heats. */
  readonly heatNumber: number | null
  readonly lanes: readonly StartListLane[]
}

export interface StartListGroup {
  /** `Event N` in the federation's numbering. */
  readonly eventNumber: number
  /** The category the group is labelled with; a merged group carries the senior name (Article 9). */
  readonly categoryId: CategoryId
  readonly mergedCategories: readonly CategoryId[]
  readonly gender: Gender
  readonly heats: readonly StartListHeat[]
  readonly flags: readonly SeedingFlag[]
}

export interface StartList {
  readonly championship: Championship
  readonly race: RaceCode
  readonly roundKey: string
  readonly rulesetVersion: string
  readonly groups: readonly StartListGroup[]
  /** False when an open rule question or unusable source data affects the list. */
  readonly official: boolean
  /** Why the list cannot be official, when it cannot. */
  readonly blockers: readonly SeedingFlag[]
  /**
   * For a round whose field comes from earlier rounds: the approved result
   * sets it was built from. The database refuses the list if they are no
   * longer the current approved results.
   */
  readonly sources?: readonly { readonly roundId: string; readonly resultSetId: string }[]
}

export interface StartListInput {
  readonly championship: Championship
  readonly race: RaceCode
  readonly roundKey: string
  readonly entrants: readonly StartListEntrant[]
  /** Keyed by athlete id. Missing = no previous-season ranking. */
  readonly rankings: ReadonlyMap<string, PreviousRanking>
  readonly ruleset: SeasonRuleset
}

const GENDER_ORDER: readonly Gender[] = ["F", "M"]

/** Event number of a category × gender block: the position in the federation's ordering, 1-based. */
export function eventNumber(ruleset: SeasonRuleset, categoryId: CategoryId, gender: Gender): number {
  const index = ruleset.categories.findIndex((c) => c.id === categoryId)
  if (index === -1) throw new Error(`Category ${categoryId} is not in ruleset ${ruleset.version}.`)
  return index * GENDER_ORDER.length + GENDER_ORDER.indexOf(gender) + 1
}

export function generateStartList(input: StartListInput): StartList {
  const { championship, race, roundKey, entrants, rankings, ruleset } = input
  const seen = new Set<string>()
  for (const e of entrants) {
    if (seen.has(e.athleteId)) throw new Error(`Athlete ${e.athleteId} is entered twice.`)
    seen.add(e.athleteId)
  }

  const massStart = roundKey === "race"
  const spec = massStart ? null : findRound(championship, race, roundKey)
  if (spec && spec.prerequisites.length > 0) {
    throw new Error(`Round ${roundKey} takes its field from earlier rounds, not from club entries.`)
  }

  // Group by category (merged for long distances) and gender.
  const groups = new Map<string, { categoryId: CategoryId; merged: readonly CategoryId[]; gender: Gender; entrants: StartListEntrant[] }>()
  for (const e of entrants) {
    const { groupCategoryId, mergedWith } = mergedCategoriesFor(race, e.categoryId)
    const key = `${groupCategoryId}|${e.gender}`
    const group = groups.get(key) ?? { categoryId: groupCategoryId, merged: mergedWith, gender: e.gender, entrants: [] }
    group.entrants.push(e)
    groups.set(key, group)
  }

  const blockers: SeedingFlag[] = []
  const built: StartListGroup[] = [...groups.values()]
    .map((g) => {
      if (massStart) {
        // A single pack: no heats, no seeding rule. Listed by federation number.
        const ordered = [...g.entrants].sort((a, b) => a.federationNumber - b.federationNumber)
        return {
          eventNumber: eventNumber(ruleset, g.categoryId, g.gender),
          categoryId: g.categoryId,
          mergedCategories: g.merged,
          gender: g.gender,
          heats: [{ heatNumber: null, lanes: ordered.map((entrant, i) => ({ lane: i + 1, seed: null, entrant })) }],
          flags: [],
        }
      }

      const seeding = seedFromPreviousSeason(
        race,
        g.entrants.map((e) => {
          const r = rankings.get(e.athleteId)
          return {
            athleteId: e.athleteId,
            federationNumber: e.federationNumber,
            previousRank: r?.rank ?? null,
            rankNeedsReview: r?.needsReview ?? false,
            ...(r?.rankRaw ? { rankRaw: r.rankRaw } : {}),
          }
        })
      )
      if (!maySeedOfficially(seeding)) blockers.push(...seeding.flags.filter((f) => f.openQuestion === "Q2"))

      const byId = new Map(g.entrants.map((e) => [e.athleteId, e]))
      const seedOf = new Map(seeding.seeded.map((s) => [s.athleteId, s.seed]))
      let heats: HeatAssignment[]
      try {
        heats = generateHeats(spec!, seeding.seeded.map((s) => s.athleteId))
      } catch (error) {
        if (error instanceof RuleIncompleteError) {
          blockers.push({ openQuestion: error.openQuestion, detail: error.message })
          heats = []
        } else throw error
      }
      return {
        eventNumber: eventNumber(ruleset, g.categoryId, g.gender),
        categoryId: g.categoryId,
        mergedCategories: g.merged,
        gender: g.gender,
        heats: heats.map((h) => ({
          heatNumber: h.heatNumber,
          lanes: assignLanes(h.athleteIds).map(({ lane, entry }) => ({ lane, seed: seedOf.get(entry) ?? null, entrant: byId.get(entry)! })),
        })),
        flags: seeding.flags,
      }
    })
    .sort((a, b) => a.eventNumber - b.eventNumber)

  return {
    championship,
    race,
    roundKey,
    rulesetVersion: ruleset.version,
    groups: built,
    official: blockers.length === 0,
    blockers,
  }
}

/** Every athlete id on the list, for checking it against the round's entries. */
export function startListAthleteIds(list: StartList): string[] {
  return list.groups.flatMap((g) => g.heats.flatMap((h) => h.lanes.map((l) => l.entrant.athleteId)))
}
