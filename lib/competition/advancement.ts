/**
 * Start lists for the rounds whose field comes from earlier rounds: the League
 * and Cup rounds of 16/24, quarter- and semi-finals, finals and level B.
 *
 * The field and its order come only from the APPROVED results of the
 * prerequisite round, through the bracket definitions in rules/progression.ts:
 *
 *   - level A rounds take the athletes who advanced, in advancement order
 *     (fastest qualifier = seed 1; or heat winners by heat, then runners-up);
 *   - level B takes everyone who did not, best qualification result first
 *     (RULE_MATRIX §8.1);
 *   - the 100m Final A takes the semi-final winners and Final B the runners-up.
 *
 * The first round after the Qualifications is registered for (Q12, federation
 * answer of 2026-11-03): only athletes their club registered take part. When
 * fewer level A athletes register than the round holds (16, or 24 for
 * 800/1000m, or 12 for 200m), the best registered level B athletes by
 * qualification time are promoted to fill it, and level B runs with the rest.
 *
 * The heats are then built exactly as for a first round (generateHeats), which
 * reproduces the official nested tables: 1 v 16, 2 v 15 … in the round of 16,
 * winner H1 v winner H8 in the quarter-final, and so on (heats.test.ts).
 *
 * Like the rest of the rules engine this is pure: the same approved results
 * always give the same start list.
 */

import { roundOutcome, type LineStatus, type QualificationLine } from "./results"
import { findRound, generateHeats, type AdvanceRule, type HeatAssignment, type RoundSpec } from "./rules/progression"
import { assignLanes } from "./rules/heats"
import type { SeedingFlag } from "./rules/seeding"
import { RuleIncompleteError, type CategoryId, type Championship, type RaceCode, type SeasonRuleset } from "./rules/types"
import type { StartList, StartListEntrant, StartListGroup } from "./start-list"

export interface ResultLineInput {
  readonly status: LineStatus
  readonly timeCs: number | null
  readonly position: number | null
}

/** The approved results of the round this one takes its field from. */
export interface PrerequisiteResults {
  readonly roundId: string
  readonly resultSetId: string
  readonly championship: Championship
  readonly roundKey: string
  /** The prerequisite's published start list: who raced, in which event and heat. */
  readonly startList: StartList
  /** Approved result lines, keyed by athlete id. */
  readonly lines: ReadonlyMap<string, ResultLineInput>
}

export interface AdvancementStartListInput {
  readonly championship: Championship
  readonly race: RaceCode
  readonly roundKey: string
  /** Categories allowed in this round; empty = every category of the prerequisite. */
  readonly eligibleCategories: readonly CategoryId[]
  readonly ruleset: SeasonRuleset
  readonly source: PrerequisiteResults
  /**
   * Athletes registered by their clubs, for the first round after the
   * Qualifications and its level B. Absent for rounds filled automatically.
   */
  readonly registered?: ReadonlySet<string>
}

/** How many athletes a round sends on when its field is full. */
function fullField(rule: AdvanceRule, heats: RoundSpec["heats"]): number | null {
  switch (rule.kind) {
    case "fastest_times":
      return rule.count
    case "heat_positions":
      return typeof heats === "number" ? rule.positions.length * heats : null
    case "heat_winners_plus_times":
      return rule.fillTo ?? (typeof heats === "number" ? heats + rule.additionalByTime : null)
    case "final":
      return null
  }
}

export function generateAdvancementStartList(input: AdvancementStartListInput): StartList {
  const { championship, race, roundKey, eligibleCategories, ruleset, source, registered } = input
  const spec = findRound(championship, race, roundKey)
  if (spec.prerequisites.length !== 1 || spec.prerequisites[0] !== source.roundKey) {
    throw new Error(`Round ${roundKey} of ${championship}/${race} takes its field from '${spec.prerequisites.join(", ")}', not '${source.roundKey}'.`)
  }
  const previous = findRound(source.championship, race, source.roundKey)

  // Every athlete on the prerequisite's start list must have an approved line.
  const entrants = new Map<string, StartListEntrant>()
  const lines: QualificationLine[] = []
  for (const group of source.startList.groups) {
    for (const heat of group.heats) {
      for (const lane of heat.lanes) {
        const line = source.lines.get(lane.entrant.athleteId)
        if (!line) throw new Error(`No approved result for athlete ${lane.entrant.athleteId} in the previous round.`)
        entrants.set(lane.entrant.athleteId, lane.entrant)
        lines.push({ athleteId: lane.entrant.athleteId, eventNumber: group.eventNumber, heatNumber: heat.heatNumber, ...line })
      }
    }
  }

  const outcome = roundOutcome(source.championship, race, source.roundKey, lines)
  const blockers: SeedingFlag[] = [...outcome.blockers]
  const target = fullField(previous.advance, previous.heats)
  const expected = roundKey === "final_a" || roundKey === "final_b" ? 2 : roundKey === "level_b" ? null : target
  const timeOf = new Map(lines.map((l) => [l.athleteId, l.status === "ok" ? l.timeCs : null]))

  const groups: StartListGroup[] = []
  for (const previousGroup of source.startList.groups) {
    const result = outcome.groups.find((g) => g.eventNumber === previousGroup.eventNumber)
    if (!result) continue
    if (eligibleCategories.length > 0 && !eligibleCategories.includes(previousGroup.categoryId)) continue

    let field: readonly string[]
    if (registered) {
      // Q12: registered level A first; empty places go to the best registered level B.
      const a = result.advancing.filter((id) => registered.has(id))
      const b = result.eliminated.filter((id) => registered.has(id))
      const promoted = b.slice(0, Math.max(0, (target ?? a.length) - a.length))
      field = roundKey === "level_b" ? b.slice(promoted.length) : [...a, ...promoted]
    } else if (roundKey === "level_b") field = result.eliminated
    else if (roundKey === "final_a" || roundKey === "final_b") {
      const place = roundKey === "final_a" ? 1 : 2
      field = result.heatResults
        .filter((r) => r.positionInHeat === place)
        .sort((a, b) => a.heatNumber - b.heatNumber)
        .map((r) => r.athleteId)
    } else field = result.advancing
    if (field.length === 0) continue
    if (spec.seedByTime) {
      // Fastest = seed 1; no time (Q3) at the bottom; equal times keep their order.
      const t = (id: string) => timeOf.get(id) ?? Number.MAX_SAFE_INTEGER
      field = [...field].sort((x, y) => t(x) - t(y))
    }

    const flags: SeedingFlag[] = []
    if (expected !== null && field.length < expected) {
      flags.push({
        openQuestion: "Q5",
        detail: `${field.length} من ${expected} لاعباً فقط؛ من يكون وحده في الـ heat يتأهل دون منافس`,
      })
    }

    let heats: HeatAssignment[]
    try {
      heats = generateHeats(spec, field)
    } catch (error) {
      if (!(error instanceof RuleIncompleteError)) throw error
      if (!blockers.some((b) => b.openQuestion === error.openQuestion)) blockers.push({ openQuestion: error.openQuestion, detail: error.message })
      heats = []
    }

    const seedOf = new Map(field.map((id, i) => [id, i + 1]))
    groups.push({
      eventNumber: previousGroup.eventNumber,
      categoryId: previousGroup.categoryId,
      mergedCategories: previousGroup.mergedCategories,
      gender: previousGroup.gender,
      heats: heats.map((h) => ({
        heatNumber: h.heatNumber,
        lanes: assignLanes(h.athleteIds).map(({ lane, entry }) => ({ lane, seed: seedOf.get(entry) ?? null, entrant: entrants.get(entry)! })),
      })),
      flags,
    })
  }

  return {
    championship,
    race,
    roundKey,
    rulesetVersion: ruleset.version,
    groups: groups.sort((a, b) => a.eventNumber - b.eventNumber),
    official: blockers.length === 0,
    blockers,
    sources: [{ roundId: source.roundId, resultSetId: source.resultSetId }],
  }
}
