/**
 * Verification of the rules engine against the REAL legacy federation data.
 *
 * This is the acceptance check for Stage 1 of the implementation plan: the
 * engine must reproduce the federation's own spreadsheet, and must parse every
 * real time or explicitly reject it with a reason — never coerce one silently.
 *
 * Real athlete data is personal data and is deliberately NOT committed as a
 * fixture (the brief requires synthetic data in automated tests). This suite
 * therefore reads an extract produced from the source workbook and SKIPS
 * cleanly when that extract is absent, so CI stays green without it.
 *
 * To run it, export the extract with docs/scripts/extract-legacy-verification.py
 * and point LEGACY_VERIFY_JSON at the result:
 *
 *   python docs/scripts/extract-legacy-verification.py "<path to .xlsm>" out.json
 *   LEGACY_VERIFY_JSON=out.json npx vitest run
 */

import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { assignCategory, findCategoryByArabicName } from "../rules/age-category"
import { SEASON_2026_2027 } from "../rules/rulesets/season-2026-2027"
import { parseLegacyTime } from "../rules/time"
import type { RaceCode } from "../rules/types"

interface LegacyAthlete {
  fed: number
  name: string
  cat2526: string | null
  cat2627: string | null
  yob: number | null
}

interface LegacyRecord {
  fed: number
  race: RaceCode
  time: unknown
}

const extractPath = process.env.LEGACY_VERIFY_JSON
const available = Boolean(extractPath && existsSync(extractPath))

const data: { athletes: LegacyAthlete[]; records: LegacyRecord[] } = available
  ? JSON.parse(readFileSync(extractPath!, "utf-8"))
  : { athletes: [], records: [] }

/** Excel time cells are encoded as a tagged object by the extraction script. */
function decode(value: unknown): unknown {
  if (value && typeof value === "object" && "__time__" in (value as object)) {
    return value
  }
  return value
}

describe.skipIf(!available)("age categories vs the federation spreadsheet", () => {
  it("has loaded the expected extract", () => {
    expect(data.athletes).toHaveLength(777)
    expect(data.records).toHaveLength(3476)
  })

  it("reproduces المرحلة 2026-2027 for every athlete with a birth year, with ZERO mismatches", () => {
    const mismatches: string[] = []
    let verified = 0

    for (const athlete of data.athletes) {
      if (athlete.yob === null || athlete.cat2627 === null) continue
      const assignment = assignCategory(athlete.yob, SEASON_2026_2027)
      if (!assignment.resolved) {
        mismatches.push(`${athlete.fed}: YOB ${athlete.yob} did not resolve`)
        continue
      }
      const expected = findCategoryByArabicName(athlete.cat2627, SEASON_2026_2027)
      if (!expected) {
        mismatches.push(`${athlete.fed}: sheet category '${athlete.cat2627}' is not an official 2026-27 name`)
        continue
      }
      if (assignment.category.id !== expected.id) {
        mismatches.push(
          `${athlete.fed}: YOB ${athlete.yob} -> '${assignment.category.nameAr}' but sheet says '${athlete.cat2627}'`
        )
      }
      verified++
    }

    expect(mismatches).toEqual([])
    expect(verified).toBe(761)
  })

  it("reports exactly the 16 athletes with no birth year as unresolved (Q14)", () => {
    const unresolved = data.athletes.filter((a) => !assignCategory(a.yob, SEASON_2026_2027).resolved)
    expect(unresolved).toHaveLength(16)
    // Every one must be unresolved for the documented reason, not an invalid value.
    for (const athlete of unresolved) {
      const assignment = assignCategory(athlete.yob, SEASON_2026_2027)
      expect(assignment.resolved).toBe(false)
      if (!assignment.resolved) expect(assignment.reason).toBe("birth_year_missing")
    }
  })

  it("never assigns a category to an athlete the federation left blank", () => {
    // The sheet's own 2026-27 column is blank for exactly these athletes, so a
    // resolved category here would mean we invented data.
    for (const athlete of data.athletes) {
      if (athlete.cat2627 === null) {
        expect(assignCategory(athlete.yob, SEASON_2026_2027).resolved).toBe(false)
      }
    }
  })
})

describe.skipIf(!available)("time parsing vs all 3476 real legacy times", () => {
  it("parses or explicitly rejects every time, with no silent coercion", () => {
    const failures = new Map<string, { count: number; samples: string[] }>()
    let parsed = 0

    for (const record of data.records) {
      const result = parseLegacyTime(decode(record.time), record.race)
      if (result.ok) {
        parsed++
        // A parsed time must be a positive integer count of centiseconds.
        expect(Number.isInteger(result.centiseconds)).toBe(true)
        expect(result.centiseconds).toBeGreaterThan(0)
      } else {
        const key = `${result.reason}`
        const bucket = failures.get(key) ?? { count: 0, samples: [] }
        bucket.count++
        if (bucket.samples.length < 5) bucket.samples.push(`${record.race}:${JSON.stringify(record.time)}`)
        failures.set(key, bucket)
      }
    }

    // The only acceptable rejections are the 2 known status codes (FS, DQ).
    // Anything else means the parser does not understand the real data.
    const unexpected = [...failures.entries()].filter(([reason]) => reason !== "status_code")
    expect(
      unexpected.map(([reason, b]) => `${reason} x${b.count}: ${b.samples.join(", ")}`),
      "unexpected time-parse failures"
    ).toEqual([])

    expect(failures.get("status_code")?.count ?? 0).toBe(2)
    expect(parsed).toBe(3474)
  })

  it("places every parsed time inside its race plausibility band", () => {
    // Already enforced by the parser; asserted here so a widened band that
    // admits a misparse shows up as a verification failure.
    for (const record of data.records) {
      const result = parseLegacyTime(decode(record.time), record.race)
      if (!result.ok) continue
      if (record.race === "100m") {
        expect(result.centiseconds).toBeGreaterThanOrEqual(800)
        expect(result.centiseconds).toBeLessThanOrEqual(4000)
      }
      if (record.race === "middle") {
        // The two-dot format trap: a misparsed "1.50.50" would be 150cs here.
        expect(result.centiseconds).toBeGreaterThanOrEqual(6000)
      }
    }
  })

  it("resolves every record to a known athlete", () => {
    const known = new Set(data.athletes.map((a) => a.fed))
    const orphans = data.records.filter((r) => !known.has(r.fed))
    expect(orphans).toEqual([])
  })
})
