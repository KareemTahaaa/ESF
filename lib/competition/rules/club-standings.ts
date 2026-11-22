/**
 * Club standings — Article 8 (المادة 8) of the season regulations.
 *
 * `يتم ترتيب الأندية بناءً على مجموع النقاط التي حققها اللاعبون من كل نادي في
 * البطولة ويكون ترتيب الأندية في كل بطولة على حدا` — a club's standing is the sum
 * of its athletes' points WITHIN ONE championship, computed separately for each.
 *
 * Standings exist only for the championships listed in the ruleset
 * (`clubStandingsChampionships`): the National League and the Egypt Cup. The
 * qualification round is explicitly excluded by Article 8.
 *
 * Points count for the club the athlete represented AT THE TIME OF THE RESULT.
 * Callers pass that club on each award, so a later transfer never moves points
 * already earned.
 */

import type { Championship, SeasonRuleset } from "./types"

/** One approved points award, attributed to the club at the time of the result. */
export interface ClubPointsAward {
  readonly athleteId: string
  /** Club the athlete represented when the result was achieved. */
  readonly clubId: string
  readonly championship: Championship
  readonly points: number
  /** Identifies the source result, so each award can be traced and de-duplicated. */
  readonly resultId: string
}

export interface ClubStanding {
  readonly clubId: string
  readonly rank: number
  readonly points: number
  /** True when this club shares its rank with another. */
  readonly tied: boolean
  /** Result ids that contributed, for traceability. */
  readonly contributingResultIds: readonly string[]
}

export interface ClubStandingsResult {
  readonly championship: Championship
  readonly rulesetVersion: string
  readonly standings: readonly ClubStanding[]
}

/**
 * Computes club standings for one championship.
 *
 * `clubIds` lists every club that should appear, so a club with no scoring
 * athletes is shown with 0 points rather than silently vanishing.
 *
 * Throws when asked for a championship Article 8 excludes, and when the same
 * result id appears twice — a duplicated award would double-count points after
 * a correction or re-import.
 */
export function calculateClubStandings(
  championship: Championship,
  awards: readonly ClubPointsAward[],
  clubIds: readonly string[],
  ruleset: SeasonRuleset
): ClubStandingsResult {
  if (!ruleset.clubStandingsChampionships.includes(championship)) {
    throw new Error(
      `Article 8 computes club standings only for ${ruleset.clubStandingsChampionships.join(", ")}; ` +
        `'${championship}' is excluded.`
    )
  }

  const seenResults = new Set<string>()
  const totals = new Map<string, { points: number; results: string[] }>()
  for (const clubId of clubIds) totals.set(clubId, { points: 0, results: [] })

  for (const award of awards) {
    // Awards from another championship are ignored, never pooled: standings
    // are `في كل بطولة على حدا` — per championship.
    if (award.championship !== championship) continue

    const key = `${award.resultId}:${award.athleteId}`
    if (seenResults.has(key)) {
      throw new Error(`Duplicate points award for result '${award.resultId}', athlete '${award.athleteId}'.`)
    }
    seenResults.add(key)

    if (!Number.isFinite(award.points) || award.points < 0) {
      throw new Error(`Invalid points value ${award.points} on result '${award.resultId}'.`)
    }

    const entry = totals.get(award.clubId) ?? { points: 0, results: [] }
    entry.points += award.points
    if (award.points > 0) entry.results.push(award.resultId)
    totals.set(award.clubId, entry)
  }

  // Highest points first; club id breaks display order only, never rank.
  const ordered = [...totals.entries()].sort((a, b) => b[1].points - a[1].points || a[0].localeCompare(b[0]))

  // Article 8 names a winner (`الأكثر تحصيلاً للنقاط`) but defines no tie-break,
  // so equal totals share a rank rather than being split by an invented rule.
  const standings: ClubStanding[] = []
  ordered.forEach(([clubId, entry], index) => {
    const previous = standings[index - 1]
    const rank = previous && previous.points === entry.points ? previous.rank : index + 1
    standings.push({ clubId, rank, points: entry.points, tied: false, contributingResultIds: entry.results })
  })

  const rankCounts = new Map<number, number>()
  for (const s of standings) rankCounts.set(s.rank, (rankCounts.get(s.rank) ?? 0) + 1)

  return {
    championship,
    rulesetVersion: ruleset.version,
    standings: standings.map((s) => ({ ...s, tied: (rankCounts.get(s.rank) ?? 0) > 1 })),
  }
}

export interface AthleteTotal {
  readonly athleteId: string
  readonly points: number
  /** Every contributing award, so an authorised user can see where each point came from. */
  readonly contributions: readonly ClubPointsAward[]
}

/**
 * Season points total per athlete within one championship, with the awards
 * that produced it. Kept separate from club standings: an athlete's total
 * follows the athlete across a transfer, whereas club standings follow the club
 * at the time of each result.
 */
export function calculateAthleteTotals(
  championship: Championship,
  awards: readonly ClubPointsAward[]
): readonly AthleteTotal[] {
  const seen = new Set<string>()
  const totals = new Map<string, ClubPointsAward[]>()

  for (const award of awards) {
    if (award.championship !== championship) continue
    const key = `${award.resultId}:${award.athleteId}`
    if (seen.has(key)) {
      throw new Error(`Duplicate points award for result '${award.resultId}', athlete '${award.athleteId}'.`)
    }
    seen.add(key)
    const list = totals.get(award.athleteId) ?? []
    list.push(award)
    totals.set(award.athleteId, list)
  }

  return [...totals.entries()]
    .map(([athleteId, contributions]) => ({
      athleteId,
      points: contributions.reduce((sum, a) => sum + a.points, 0),
      contributions,
    }))
    .sort((a, b) => b.points - a.points || a.athleteId.localeCompare(b.athleteId))
}
