/**
 * The import parser run on the REAL `Egypt Skate Database.xlsm`.
 *
 * Like legacy-verification.test.ts, the workbook holds personal data and is not
 * committed; this suite skips unless pointed at it:
 *
 *   LEGACY_WORKBOOK="<path to Egypt Skate Database.xlsm>" npx vitest run legacy-import
 *
 * The expected figures are the first-run figures predicted in
 * docs/phase-2/DATA_MIGRATION_MAP.md §7 from inspecting the file with openpyxl.
 * ExcelJS reaching the same numbers independently is the check that the
 * production reader sees the workbook the way the audit did.
 */

import { existsSync, readFileSync } from "node:fs"
import { beforeAll, describe, expect, it } from "vitest"
import { previewAthleteImport, type AthleteData } from "../import/athletes"
import { previewRecordsImport, type HistoricalResultData } from "../import/records"
import type { ImportPreview } from "../import/types"
import { readWorkbook } from "../import/workbook"
import { parseLegacyTime } from "../rules/time"
import type { RaceCode } from "../rules/types"
import { SEASON_2026_2027 } from "../rules/rulesets/season-2026-2027"

const path = process.env.LEGACY_WORKBOOK
const available = Boolean(path && existsSync(path))
const extractPath = process.env.LEGACY_VERIFY_JSON

describe.skipIf(!available)("import preview of the real legacy workbook", () => {
  let athletes: ImportPreview<AthleteData>
  let records: ImportPreview<HistoricalResultData>

  beforeAll(async () => {
    const sheets = await readWorkbook(readFileSync(path!))
    athletes = previewAthleteImport(sheets.find((s) => s.name === "Database")!, {
      ruleset: SEASON_2026_2027,
      rankingsSeason: "2025-2026",
    })
    const registry = new Map(athletes.rows.map((r) => [r.data.federation_number!, r.data.full_name_ar!]))
    records = previewRecordsImport(sheets.find((s) => s.name === "Records")!, { registry })
  }, 120_000)

  it("athletes: 777 rows, the 16 without a birth year not imported, every column accounted for", () => {
    expect(athletes.rows).toHaveLength(777)
    expect(athletes.missingColumns).toEqual([])
    expect(athletes.unmappedColumns).toEqual([])
    expect(athletes.counts.rejected).toBe(16)
    expect(athletes.counts.needs_review).toBe(0)
    expect(athletes.counts.accepted + athletes.counts.warning).toBe(761)
  })

  it("athletes: exactly the 16 missing birth years (Q14) and 138 corrupt Cup ranks (Q2)", () => {
    const codes = athletes.rows.flatMap((r) => r.issues.map((i) => i.code))
    expect(codes.filter((c) => c === "birth_year_missing")).toHaveLength(16)
    expect(codes.filter((c) => c === "rank_invalid")).toHaveLength(138)
    expect(codes.filter((c) => c === "category_mismatch")).toHaveLength(0)
  })

  it("records: 3476 rows, 2 status codes, nothing rejected", () => {
    expect(records.rows).toHaveLength(3476)
    expect(records.missingColumns).toEqual([])
    expect(records.counts).toEqual({ accepted: 3474, warning: 2, needs_review: 0, rejected: 0, suspected_duplicate: 0 })
  })

  it.skipIf(!extractPath || !existsSync(extractPath))(
    "records: every time equals the openpyxl-based parse of the same cell",
    () => {
      const extract: { records: { fed: number; race: RaceCode; time: unknown }[] } = JSON.parse(
        readFileSync(extractPath!, "utf-8")
      )
      expect(extract.records).toHaveLength(records.rows.length)
      const differences: string[] = []
      extract.records.forEach((rec, i) => {
        const row = records.rows[i]!
        const expected = parseLegacyTime(rec.time, rec.race)
        const expectedCs = expected.ok ? expected.centiseconds : null
        if (row.data.federation_number !== rec.fed || row.data.time_cs !== expectedCs) {
          differences.push(`row ${row.row_number}: ${row.data.time_cs} vs ${expectedCs}`)
        }
      })
      expect(differences).toEqual([])
    }
  )
})
