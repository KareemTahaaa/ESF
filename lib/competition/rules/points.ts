/**
 * Championship points — Article 5 (المادة 5) of the season regulations.
 *
 * Three rules accompany the points table, all quoted in docs/rules/RULE_MATRIX.md §3:
 *
 *  1. `يبدأ احتساب النقاط للاعبين في أي مرحلة عندما يكون هناك 3 لاعبين أو أكثر
 *     في المرحلة` — points are awarded in a category only when it has 3 or more
 *     athletes. Below that, NO points at all for that category.
 *
 *  2. `إذا احتل اثنان أو أكثر من اللاعبين نفس المركز في التصنيف النهائي، يتم منح
 *     النقاط بالتساوي` — athletes sharing a final position each receive that
 *     position's FULL points. "Equally" (بالتساوي), not divided.
 *
 *  3. `في سباق التتابع يتم منح الفريق النقاط حسب الترتيب النهائي للفريق` — in a
 *     relay the TEAM scores by the team's final position. Relay is not
 *     implemented: no team composition or point-distribution rule exists
 *     anywhere in the sources (OPEN_QUESTIONS Q10).
 *
 * Two things the regulations do NOT say, and which are therefore not guessed:
 *  - Whether a shared position consumes the following position(s) (Q6). This is
 *    a ruleset setting, and a tie BLOCKS official publication until confirmed.
 *  - Any effect of DNS/DNF/DQ/FS on position, points, or the participant count
 *    (Q3). A non-`ok` status likewise BLOCKS official publication.
 */

import type { CategoryId, ResultStatus, SeasonRuleset } from "./types"

/** One athlete's final standing in a race, as approved by officials. */
export interface RankedEntry {
  readonly athleteId: string
  /**
   * Final position, 1-based. Tied athletes share the same position value.
   * `null` when the athlete has no finishing position (e.g. DNS).
   */
  readonly position: number | null
  readonly status: ResultStatus
}

export interface PointsAward {
  readonly athleteId: string
  readonly position: number | null
  readonly points: number
  /** Why no points were awarded, when `points` is 0 but the athlete took part. */
  readonly zeroReason?: ZeroPointsReason
  /** True when this athlete shares their position with another. */
  readonly tied: boolean
}

export type ZeroPointsReason =
  /** Finished outside the scoring positions (9th or lower). */
  | "outside_scoring_positions"
  /** Category had fewer than the minimum number of athletes. */
  | "below_minimum_participants"
  /** Non-`ok` result status; effect undefined by the regulations (Q3). */
  | "non_finisher_status"
  /** No finishing position recorded. */
  | "no_position"

/** A reason official points publication is blocked for this calculation. */
export interface PointsBlocker {
  readonly openQuestion: string
  readonly ruleReference: string
  readonly detail: string
}

export interface PointsCalculation {
  readonly categoryId: CategoryId
  readonly rulesetVersion: string
  readonly awards: readonly PointsAward[]
  /** Athletes counted toward the Article 5 minimum-participants threshold. */
  readonly participantCount: number
  /** False when the category fell below the minimum and nobody scores. */
  readonly pointsAwarded: boolean
  /**
   * Non-empty when an unresolved rule affects this calculation. Official
   * publication MUST be refused while this is non-empty. An unofficial preview
   * may be shown if clearly marked.
   */
  readonly blockers: readonly PointsBlocker[]
}

/**
 * Points for a single finishing position in a category.
 * Returns 0 for positions outside the table — the regulations award points for
 * positions 1..8 only.
 */
export function pointsForPosition(
  categoryId: CategoryId,
  position: number,
  ruleset: SeasonRuleset
): number {
  const row = ruleset.points[categoryId]
  if (!row) {
    // Never silently 0: an unknown category is a programming or data error, and
    // returning 0 would quietly erase an athlete's points.
    throw new Error(`No points row for category '${categoryId}' in ruleset '${ruleset.version}'.`)
  }
  if (!Number.isInteger(position) || position < 1) {
    throw new Error(`Invalid finishing position: ${position}`)
  }
  return row[position - 1] ?? 0
}

/**
 * Calculates championship points for every athlete in one category of one race.
 *
 * `entries` must all belong to the same category: the minimum-participants rule
 * and the points table are both per-category.
 */
export function calculatePoints(
  categoryId: CategoryId,
  entries: readonly RankedEntry[],
  ruleset: SeasonRuleset
): PointsCalculation {
  const blockers: PointsBlocker[] = []

  // --- Participant count ----------------------------------------------------
  // Whether a DQ athlete counts toward the threshold is undefined (Q3). We
  // exclude non-finishers, and block publication if any are present so the
  // choice is confirmed rather than assumed.
  const finishers = entries.filter((e) => e.status === "ok")
  const participantCount = finishers.length

  const nonFinishers = entries.filter((e) => e.status !== "ok")
  if (nonFinishers.length > 0) {
    blockers.push({
      openQuestion: "Q3",
      ruleReference: "2026-2027.docx — no DNS/DNF/DQ/FS rule exists",
      detail:
        `${nonFinishers.length} of ${entries.length} entries have a non-finisher status ` +
        `(${[...new Set(nonFinishers.map((e) => e.status))].join(", ")}). The regulations do not ` +
        `define their effect on position, points, or the participant count`,
    })
  }

  // --- Ties -----------------------------------------------------------------
  const positionCounts = new Map<number, number>()
  for (const entry of finishers) {
    if (entry.position !== null) {
      positionCounts.set(entry.position, (positionCounts.get(entry.position) ?? 0) + 1)
    }
  }
  // Shared positions: each athlete gets that position's full points (Article
  // 5) and the following position is skipped (federation answer to Q6,
  // 2026-11-03; `tieConsumesPositions` in the ruleset).

  // --- Minimum participants -------------------------------------------------
  const pointsAwarded = participantCount >= ruleset.minimumAthletesForPoints

  const awards: PointsAward[] = entries.map((entry) => {
    const tied = entry.position !== null && (positionCounts.get(entry.position) ?? 0) > 1

    if (entry.status !== "ok") {
      return { athleteId: entry.athleteId, position: entry.position, points: 0, zeroReason: "non_finisher_status", tied }
    }
    if (entry.position === null) {
      return { athleteId: entry.athleteId, position: null, points: 0, zeroReason: "no_position", tied: false }
    }
    if (!pointsAwarded) {
      return {
        athleteId: entry.athleteId,
        position: entry.position,
        points: 0,
        zeroReason: "below_minimum_participants",
        tied,
      }
    }

    const points = pointsForPosition(categoryId, entry.position, ruleset)
    if (points === 0) {
      return {
        athleteId: entry.athleteId,
        position: entry.position,
        points: 0,
        zeroReason: "outside_scoring_positions",
        tied,
      }
    }
    return { athleteId: entry.athleteId, position: entry.position, points, tied }
  })

  return {
    categoryId,
    rulesetVersion: ruleset.version,
    awards,
    participantCount,
    pointsAwarded,
    blockers,
  }
}

/**
 * Assigns final positions from an ordered list of athletes, grouping ties.
 *
 * `tieConsumesPositions` (Q6, answered 2026-11-03: true):
 *  - true  (default): two athletes tied 1st, next is 3rd — standard practice.
 *  - false:           two athletes tied 1st, next is 2nd.
 *
 * `groups` is ordered best-first; each inner array is a set of tied athletes.
 */
export function assignPositions(
  groups: readonly (readonly string[])[],
  ruleset: SeasonRuleset
): ReadonlyMap<string, number> {
  const positions = new Map<string, number>()
  let nextPosition = 1

  for (const group of groups) {
    for (const athleteId of group) {
      positions.set(athleteId, nextPosition)
    }
    nextPosition += ruleset.tieConsumesPositions ? group.length : 1
  }

  return positions
}

/** True when official points may be published for this calculation. */
export function mayPublishOfficially(calculation: PointsCalculation): boolean {
  return calculation.blockers.length === 0
}

/** Relay points are not implemented — no rule exists (Q10). */
export function calculateRelayPoints(): never {
  throw new Error(
    "Relay scoring is not implemented: the sources define no team size, composition, " +
      "eligibility, or point-distribution rule. See docs/rules/OPEN_QUESTIONS.md Q10."
  )
}

/** Whether a status counts as a finisher. Exposed so callers do not re-derive it. */
export function isFinisher(status: ResultStatus): boolean {
  return status === "ok"
}
