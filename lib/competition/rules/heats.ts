/**
 * Heat construction — sizing and seed distribution.
 *
 * ## The serpentine finding
 *
 * Every heat-seeding table transcribed from the regulations (Article 9, Tables
 * 9-12 and their 18 nested tables) turns out to be the SAME distribution: a
 * serpentine (boustrophedon) fill, where seeds are dealt across the heats in
 * order, then back in reverse, alternating each pass.
 *
 * Verified against every pattern the sources specify:
 *
 *   100m R16, 8 heats of 2      -> H1=[1,16] H2=[2,15] ... H8=[8,9]
 *   One Lap/500m R16, 4 of 4    -> H1=[1,8,9,16] H2=[2,7,10,15] ...
 *   100m R8, 4 heats of 2       -> H1=[w1,w8] H2=[w2,w7] ...
 *   100m SF, 2 heats of 2       -> H1=[q1,q4] H2=[q2,q3]
 *   One Lap SF, 2 heats of 4    -> H1=[1stH1,1stH4,2ndH1,2ndH4] ...
 *   800/1000m SF, 3 heats of 4  -> H1=[1stH1,1stH6,tq1,tq6] ...
 *
 * So one tested primitive derives every specified pattern, rather than a dozen
 * hand-written tables that could drift apart. Each official table is still
 * asserted individually in the tests, so if a future rule revision breaks the
 * pattern, the specific table fails rather than silently following the formula.
 *
 * The one pattern that does NOT follow it is the 800/1000m round-of-24
 * (OPEN_QUESTIONS Q1), which is truncated in the source document. That is
 * consistent with it being underspecified, and it is blocked rather than
 * guessed — see progression/middle-distance.ts.
 */

/**
 * Balanced heat sizes for a field that is not a multiple of the heat size.
 *
 * ASSUMPTION — OPEN_QUESTIONS Q4. Article 9 Table 9 says only "divide all
 * registered athletes into heats of N" and never defines remainder handling.
 * This reproduces the federation's own existing practice, the `BuildHeatSizes`
 * function in `Module2` of the legacy workbook, whose comment states the
 * intent: "keeps heats similar size; avoids tiny last heat".
 *
 * 10 athletes at 4 per heat give 4, 3, 3 — not 4, 4, 2.
 */
export function buildHeatSizes(total: number, athletesPerHeat: number): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error(`Invalid athlete count: ${total}`)
  }
  if (!Number.isInteger(athletesPerHeat) || athletesPerHeat < 1) {
    throw new Error(`Invalid heat size: ${athletesPerHeat}`)
  }
  if (total === 0) return []

  const heatCount = Math.ceil(total / athletesPerHeat)
  const baseSize = Math.floor(total / heatCount)
  const remainder = total % heatCount

  // The first `remainder` heats take one extra athlete, so sizes differ by at
  // most one and the final heat is never left with a single competitor.
  return Array.from({ length: heatCount }, (_, i) => baseSize + (i < remainder ? 1 : 0))
}

/**
 * Distributes seeds across a fixed number of heats, serpentine.
 *
 * `seeds` is ordered best-first. The returned array holds one entry per heat,
 * each listing its seeds in the order the official tables list them.
 *
 * Pass 1 deals seeds across heats 1..n, pass 2 deals the next seeds back across
 * heats n..1, and so on. This is what balances the strong seeds across heats
 * and is what every official table in the regulations encodes.
 */
export function distributeSerpentine<T>(seeds: readonly T[], heatCount: number): T[][] {
  if (!Number.isInteger(heatCount) || heatCount < 1) {
    throw new Error(`Invalid heat count: ${heatCount}`)
  }
  const heats: T[][] = Array.from({ length: heatCount }, () => [])

  seeds.forEach((seed, index) => {
    const pass = Math.floor(index / heatCount)
    const positionInPass = index % heatCount
    // Odd passes run right-to-left: that is the fold that pairs 1 with 16.
    const heatIndex = pass % 2 === 0 ? positionInPass : heatCount - 1 - positionInPass
    heats[heatIndex]!.push(seed)
  })

  return heats
}

/**
 * Distributes seeds into heats of a given size, for the qualification round and
 * for level B, where the rules give an athletes-per-heat figure rather than a
 * heat count (Article 9 Table 9).
 *
 * Fills serpentine, but respects the per-heat capacities from `buildHeatSizes`,
 * skipping a heat once it is full. The two rules can disagree only when the
 * field is not a multiple of the heat size: unconstrained serpentine would put
 * the extra athlete in the LAST heat filled, whereas `buildHeatSizes` places
 * extras in the FIRST heats. Capacities win, because that matches the
 * federation's existing practice and keeps a short heat at the slow end of the
 * seeding rather than leaving the top seed to race alone.
 *
 * For an exact multiple (the 16-of-4 and 16-of-2 cases the official tables
 * specify) capacities are uniform, so this is identical to plain serpentine and
 * reproduces those tables exactly.
 */
export function distributeIntoHeatsOfSize<T>(seeds: readonly T[], athletesPerHeat: number): T[][] {
  if (seeds.length === 0) return []

  const capacities = buildHeatSizes(seeds.length, athletesPerHeat)
  const heatCount = capacities.length
  const heats: T[][] = Array.from({ length: heatCount }, () => [])

  let placed = 0
  for (const seed of seeds) {
    // Walk serpentine positions from where we are, skipping heats already full.
    let heatIndex = -1
    for (let offset = 0; offset < heatCount; offset++) {
      const index = placed + offset
      const pass = Math.floor(index / heatCount)
      const positionInPass = index % heatCount
      const candidate = pass % 2 === 0 ? positionInPass : heatCount - 1 - positionInPass
      if (heats[candidate]!.length < capacities[candidate]!) {
        heatIndex = candidate
        break
      }
    }
    if (heatIndex === -1) {
      throw new Error(`No heat with remaining capacity for ${seeds.length} seeds at ${athletesPerHeat} per heat`)
    }
    heats[heatIndex]!.push(seed)
    placed++
  }

  return heats
}

/**
 * Assigns lane numbers within a heat.
 *
 * The score-sheet template numbers lanes 1..n in the order athletes are listed
 * for the heat (`Lane | Bib | Name | Club`), and the sources specify no separate
 * lane-draw rule, so lane order follows seed order within the heat.
 */
export function assignLanes<T>(heat: readonly T[]): { lane: number; entry: T }[] {
  return heat.map((entry, index) => ({ lane: index + 1, entry }))
}
