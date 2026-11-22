/**
 * The whole import path: synthetic workbook -> parser preview -> stored batch
 * -> authorised commit, against the real migrations.
 */

import ExcelJS from "exceljs"
import { beforeAll, describe, expect, it } from "vitest"
import { previewAthleteImport } from "@/lib/competition/import/athletes"
import { previewRecordsImport } from "@/lib/competition/import/records"
import { readWorkbook, sha256 } from "@/lib/competition/import/workbook"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import { as, createTestDb, makeFederationAdmin, refusal, type Db } from "./harness"

let db: Db
let admin: string

const HEADER = ["الرقم", "رقم التسجيل", "الأسم", "النادي", "المرحلة\n2026-2027", "النوع", "YOB", "Gender", "ترتيب 100m Road", "ترتيب 800m-1000m Track\nCup"]

async function file(rows: unknown[][], sheet = "Database", header = HEADER): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheet)
  ws.addRow(header)
  for (const r of rows) ws.addRow(r)
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

async function stage(bytes: Uint8Array, kind: "athletes" | "historical_results" = "athletes"): Promise<string> {
  const sheets = await readWorkbook(bytes)
  let rows: unknown[]
  let counts: unknown
  if (kind === "athletes") {
    const p = previewAthleteImport(sheets[0]!, { ruleset: SEASON_2026_2027, rankingsSeason: "2025-2026" })
    rows = [...p.rows]
    counts = p.counts
  } else {
    const { rows: reg } = await db.query<{ n: number; name: string }>("select federation_number as n, full_name_ar as name from public.athletes")
    const p = previewRecordsImport(sheets[0]!, { registry: new Map(reg.map((r) => [r.n, r.name])) })
    rows = [...p.rows]
    counts = p.counts
  }
  return as(db, admin, async (tx) => {
    const { rows: r } = await tx.query<{ id: string }>(
      "select public.create_import_batch($1::public.import_kind, '2026-2027', 'synthetic.xlsx', $2, $3, $4) as id",
      [kind, sha256(bytes), JSON.stringify(counts), JSON.stringify(rows)]
    )
    return r[0]!.id
  })
}

const commit = (batch: string) =>
  as(db, admin, (tx) => tx.query<{ r: Record<string, number> }>("select public.commit_import_batch($1) as r", [batch]))

beforeAll(async () => {
  db = await createTestDb()
  admin = await makeFederationAdmin(db)
})

describe("athlete import pipeline", () => {
  let first: Uint8Array

  it("previews without touching the registry, then commits only importable rows", async () => {
    first = await file([
      [1, "2/1", "لاعب واحد", "الشمس", "تحت 13", "بنين", 2014, "M", 4, "Heat 2"],
      [2, "2/2", "لاعبة اثنان", "الزهور", null, "بنات", null, "F", null, null],
      [3, "2/3", "لاعب ثلاثة", "نادي مجهول", null, "بنين", 2010, "M", null, null],
    ])
    const batch = await stage(first)
    const before = await db.query("select 1 from public.athletes")
    expect(before.rows).toHaveLength(0)

    const { rows } = await commit(batch)
    // Row 2 has no birth year and row 3 an unknown club: neither is imported.
    expect(rows[0]!.r).toMatchObject({ inserted: 1, updated: 0, rankings: 1 })
    const athletes = await db.query<{ n: number; y: number | null }>(
      "select federation_number as n, birth_year as y from public.athletes order by 1"
    )
    expect(athletes.rows).toEqual([{ n: 1, y: 2014 }])
  })

  it("keeps provenance from athlete back to the source row", async () => {
    const { rows } = await db.query<{ sheet: string; row_number: number; file_name: string }>(
      `select r.sheet, r.row_number, b.file_name from public.athletes a
       join public.import_rows r on r.id = a.source_import_row
       join public.import_batches b on b.id = r.batch_id where a.federation_number = 1`
    )
    expect(rows[0]).toEqual({ sheet: "Database", row_number: 2, file_name: "synthetic.xlsx" })
  })

  it("leaves out a `Heat N` rank and keeps the readable one", async () => {
    const { rows } = await db.query(
      "select championship, rank, rank_raw, needs_review from public.previous_season_rankings order by championship"
    )
    expect(rows).toEqual([{ championship: "national_league", rank: 4, rank_raw: "4", needs_review: false }])
  })

  it("refuses to stage the identical file again", async () => {
    expect(await refusal(stage(first))).toMatch(/already imported/)
  })

  it("re-imports a corrected file as updates, replacing rankings rather than duplicating them", async () => {
    const corrected = await file([[1, "2/1", "لاعب واحد مصحح", "الشمس", "تحت 13", "بنين", 2014, "M", 5, 6]])
    const { rows } = await commit(await stage(corrected))
    expect(rows[0]!.r).toMatchObject({ inserted: 0, updated: 1 })
    const n = await db.query<{ n: number }>("select count(*)::int as n from public.athletes")
    expect(n.rows[0]!.n).toBe(1)
    const ranks = await db.query("select rank from public.previous_season_rankings p join public.athletes a on a.id = p.athlete_id where a.federation_number = 1 order by rank")
    expect(ranks.rows).toEqual([{ rank: 5 }, { rank: 6 }])
  })
})

describe("historical results pipeline", () => {
  const HEADER = ["No", "Name", "Club", "No", "Age Group", "Gender", "Race", "Event", "Season", "Date", "Time"]
  const d = new Date(Date.UTC(2026, 0, 10))
  const row = (n: number, time: unknown, race = "100m") => [n, "x", "الشمس", n, "تحت 13", "بنين", race, "نهائيات الدوري العام", "موسم 2025-2026", d, time]

  it("commits times, keeps status codes without a time, and skips rejected rows", async () => {
    const bytes = await file([row(1, " 15.34"), row(1, "FS"), row(1, 0.5)], "Records", HEADER)
    const { rows } = await commit(await stage(bytes, "historical_results"))
    expect(rows[0]!.r).toMatchObject({ results: 2 })
    const r = await db.query("select time_cs, time_raw, status from public.historical_results order by time_raw")
    expect(r.rows).toEqual([
      { time_cs: 1534, time_raw: " 15.34", status: "ok" },
      { time_cs: null, time_raw: "FS", status: "fs" },
    ])
  })

  it("a corrected Records file replaces the previous one instead of duplicating it", async () => {
    const bytes = await file([row(1, " 15.30"), row(1, "FS")], "Records", HEADER)
    await commit(await stage(bytes, "historical_results"))
    const r = await db.query("select time_cs from public.historical_results order by time_cs nulls last")
    expect(r.rows).toEqual([{ time_cs: 1530 }, { time_cs: null }])
  })
})
