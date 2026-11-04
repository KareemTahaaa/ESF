/**
 * Import parser — synthetic workbooks only (no real athlete data in fixtures).
 * Each workbook is written with ExcelJS and read back through the production
 * reader, so the tests cover the same path an upload takes.
 */

import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { normaliseArabic } from "../arabic"
import { previewAthleteImport } from "../import/athletes"
import { previewRecordsImport } from "../import/records"
import { readWorkbook, sha256 } from "../import/workbook"
import { SEASON_2026_2027 } from "../rules/rulesets/season-2026-2027"

const DB_HEADER = [
  "الرقم", "رقم التسجيل", "الأسم", "النادي", "المرحلة\n2025-2026", "المرحلة\n2026-2027", "الرقم", "النوع", "YOB",
  "first name", "last name", "Club", "Age Group Code", "Gender", "تصنيف 100m Road", "تصنيف\n 200m Track",
  "تصنيف One \nLap Road", "تصنيف\n 500m Track", "تصنيف 800m-1000m Track", "ترتيب 100m Road", "ترتيب 200m Track",
  "ترتيب One \nLap Road", "ترتيب 500m Track", "ترتيب 800m-1000m Track\nCup", "ترتيب 800m-1000m Track\nLeague",
]

type DbRow = {
  n: number | string | null
  name?: string | null
  club?: string
  code?: string
  cat?: string | null
  copy?: number | null
  ar?: string
  yob?: number | string | null
  g?: string
  levels?: (string | null)[]
  ranks?: (number | string | null)[]
}

function dbRow(r: DbRow): unknown[] {
  const levels = r.levels ?? [null, null, null, null, null]
  const ranks = r.ranks ?? [null, null, null, null, null, null]
  return [
    r.n, `2/${r.n}`, r.name === undefined ? `لاعب ${r.n}` : r.name, r.club ?? "الشمس", null, r.cat ?? null,
    r.copy === undefined ? r.n : r.copy, r.ar ?? "بنين", r.yob === undefined ? 2014 : r.yob, null, null,
    r.code ?? "SSC", null, r.g ?? "M", ...levels, ...ranks,
  ]
}

async function workbook(sheets: Record<string, unknown[][]>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name)
    for (const row of rows) ws.addRow(row)
  }
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

async function previewDb(rows: DbRow[], existing = []) {
  const sheets = await readWorkbook(await workbook({ Database: [DB_HEADER, ...rows.map(dbRow)] }))
  return previewAthleteImport(sheets[0]!, { ruleset: SEASON_2026_2027, rankingsSeason: "2025-2026", existing })
}

describe("normaliseArabic", () => {
  it("applies every matching rule of DATA_MIGRATION_MAP §5", () => {
    expect(normaliseArabic("  أشبال‏  ١١ ")).toBe("اشبال 11")
    expect(normaliseArabic("إسلام آمنة")).toBe("اسلام امنه")
    expect(normaliseArabic("مُصْطَفى")).toBe("مصطفي")
    expect(normaliseArabic("'وادي ـدجلة")).toBe("وادي دجله")
  })
})

describe("sha256", () => {
  it("identifies byte-identical files regardless of name", () => {
    const a = new TextEncoder().encode("same bytes")
    expect(sha256(a)).toBe(sha256(new TextEncoder().encode("same bytes")))
    expect(sha256(a)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("athlete import preview", () => {
  it("maps every column, including headers with embedded newlines", async () => {
    const p = await previewDb([{ n: 1, cat: "تحت 13", levels: ["A", "B", null, null, null], ranks: [3, null, null, null, null, null] }])
    expect(p.missingColumns).toEqual([])
    expect(p.unmappedColumns).toEqual([])
    expect(p.rows[0]!.status).toBe("accepted")
    expect(p.rows[0]!.data).toMatchObject({
      federation_number: 1,
      registration_number: "2/1",
      birth_year: 2014,
      gender: "M",
      club_code: "SSC",
      rankings_season: "2025-2026",
    })
    expect(p.rows[0]!.data.rankings).toEqual([
      { race_code: "100m", championship: "national_league", classification_level: "A", rank: 3, rank_raw: "3", needs_review: false },
      { race_code: "200m", championship: "national_league", classification_level: "B", rank: null, rank_raw: null, needs_review: false },
    ])
  })

  it("reports a missing required column and imports nothing", async () => {
    const sheets = await readWorkbook(await workbook({ Database: [["الرقم", "الأسم"], [1, "x"]] }))
    const p = previewAthleteImport(sheets[0]!, { ruleset: SEASON_2026_2027, rankingsSeason: "2025-2026" })
    expect(p.missingColumns).toEqual(["yob"])
    expect(p.rows).toEqual([])
  })

  it("reports unknown columns instead of dropping them silently", async () => {
    const sheets = await readWorkbook(await workbook({ Database: [[...DB_HEADER, "ملاحظات"], dbRow({ n: 1 })] }))
    const p = previewAthleteImport(sheets[0]!, { ruleset: SEASON_2026_2027, rankingsSeason: "2025-2026" })
    expect(p.unmappedColumns).toEqual(["ملاحظات"])
  })

  it("does not import an athlete with no birth year (federation instruction, Q14)", async () => {
    const p = await previewDb([{ n: 1, yob: null }])
    expect(p.rows[0]!.status).toBe("rejected")
    expect(p.rows[0]!.issues.map((i) => i.code)).toEqual(["birth_year_missing"])
  })

  it("never coerces a `Heat N` rank: the value is left out and the athlete imports without it (Q2)", async () => {
    const p = await previewDb([{ n: 1, ranks: [null, null, null, null, "Heat 5", 4] }])
    const row = p.rows[0]!
    expect(row.status).toBe("warning")
    expect(row.issues.map((i) => i.code)).toEqual(["rank_invalid"])
    expect(row.data.rankings.some((r) => r.championship === "egypt_cup")).toBe(false)
    expect(row.data.rankings).toContainEqual({
      race_code: "middle", championship: "national_league", classification_level: null, rank: 4, rank_raw: "4", needs_review: false,
    })
  })

  it("rejects a category that disagrees with the birth year", async () => {
    const p = await previewDb([{ n: 1, yob: 2014, cat: "عمومي" }])
    expect(p.rows[0]!.status).toBe("rejected")
    expect(p.rows[0]!.issues[0]!.code).toBe("category_mismatch")
  })

  it.each([
    ["missing federation number", { n: null }, "federation_number_invalid"],
    ["fractional federation number", { n: "10.5" }, "federation_number_invalid"],
    ["the two الرقم columns disagree", { n: 1, copy: 2 }, "federation_number_conflict"],
    ["missing name", { n: 1, name: null }, "name_missing"],
    ["Gender and النوع disagree", { n: 1, g: "M", ar: "بنات" }, "gender_conflict"],
    ["unknown club", { n: 1, club: "نادي غير موجود", code: "ZZZ" }, "club_unknown"],
    ["club name and code disagree", { n: 1, club: "الشمس", code: "ZSC" }, "club_conflict"],
    ["implausible birth year", { n: 1, yob: 1850 }, "birth_year_invalid"],
  ] as const)("rejects a row with %s", async (_label, row, code) => {
    const p = await previewDb([row as DbRow])
    expect(p.rows[0]!.status).toBe("rejected")
    expect(p.rows[0]!.issues.map((i) => i.code)).toContain(code)
  })

  it("matches clubs by normalised name (hamza, spacing)", async () => {
    const p = await previewDb([{ n: 1, club: "  ايروسبورت ", code: "" as string }])
    expect(p.rows[0]!.data.club_code).toBe("AERO")
  })

  it("rejects the second occurrence of a duplicate federation number", async () => {
    const p = await previewDb([{ n: 7 }, { n: 7, name: "آخر" }])
    expect(p.rows.map((r) => r.status)).toEqual(["accepted", "rejected"])
    expect(p.rows[1]!.issues.map((i) => i.code)).toEqual(["federation_number_duplicate"])
  })

  it("holds same name + birth year under different numbers for review, never merging", async () => {
    const p = await previewDb([{ n: 1, name: "أحمد علي" }, { n: 2, name: "احمد  علي" }])
    expect(p.rows.map((r) => r.status)).toEqual(["suspected_duplicate", "suspected_duplicate"])
    expect(p.rows.map((r) => r.data.federation_number)).toEqual([1, 2])
  })

  it("flags a possible duplicate of an athlete already in the registry", async () => {
    const p = await previewDb([{ n: 9, name: "منى سامي", yob: 2012 }], [
      { federationNumber: 3, fullNameAr: "منى سامى", nameNormalised: normaliseArabic("منى سامى"), birthYear: 2012 },
    ] as never)
    expect(p.rows[0]!.status).toBe("suspected_duplicate")
  })

  it("does not flag the same person by name alone when birth years differ", async () => {
    const p = await previewDb([{ n: 1, name: "علي حسن", yob: 2010 }, { n: 2, name: "علي حسن", yob: 2015 }])
    expect(p.rows.map((r) => r.status)).toEqual(["accepted", "accepted"])
  })

  it("warns that an existing athlete's name will be updated", async () => {
    const p = await previewDb([{ n: 5, name: "اسم جديد" }], [
      { federationNumber: 5, fullNameAr: "اسم قديم", nameNormalised: "اسم قديم", birthYear: 2014 },
    ] as never)
    expect(p.rows[0]!.status).toBe("warning")
    expect(p.rows[0]!.issues.map((i) => i.code)).toEqual(["will_update"])
  })

  it("counts every status", async () => {
    const p = await previewDb([{ n: 1 }, { n: 2, yob: null }, { n: 3, club: "x", code: "x" }])
    expect(p.counts).toEqual({ accepted: 1, warning: 0, needs_review: 0, rejected: 2, suspected_duplicate: 0 })
  })
})

describe("historical results import preview", () => {
  const HEADER = ["No", "Name", "Club", "No", "Age Group", "Gender", "Race", "Event", "Season", "Date", "Time"]
  const registry = new Map([[10, "لاعب عشرة"]])
  const date = new Date(Date.UTC(2025, 11, 19))

  async function preview(rows: unknown[][]) {
    const sheets = await readWorkbook(await workbook({ Records: [HEADER, ...rows] }))
    return previewRecordsImport(sheets[0]!, { registry })
  }
  const rec = (time: unknown, race = "800m-1000m", extra: Partial<Record<"no" | "club", unknown>> = {}) => [
    extra.no ?? 10, "لاعب عشرة", extra.club ?? "وادي دجلة ", extra.no ?? 10, "عمومي", "بنين", race,
    "تصفيات الدوري العام", "موسم 2025-2026", date, time,
  ]

  it("parses the two-dot minute form exactly, never as 1.5 seconds", async () => {
    const p = await preview([rec("1.50.50")])
    expect(p.rows[0]!.status).toBe("accepted")
    expect(p.rows[0]!.data).toMatchObject({
      time_cs: 11050, status: "ok", race_code: "middle", club_code: "WDC", season: "2025-2026", result_date: "2025-12-19",
    })
  })

  it("reads an Excel time cell as a race time, not a date", async () => {
    // 00:01:00.91 as a fraction of a day, written as a real Excel time cell.
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Records")
    ws.addRow(HEADER)
    ws.addRow(rec(null))
    ws.getCell("K2").value = new Date(Date.UTC(1899, 11, 30, 0, 1, 0, 910))
    ws.getCell("K2").numFmt = "mm:ss.00"
    const sheets = await readWorkbook(new Uint8Array(await wb.xlsx.writeBuffer()))
    const p = previewRecordsImport(sheets[0]!, { registry })
    expect(p.rows[0]!.data.time_cs).toBe(6091)
  })

  it("keeps a status code as a status, with no time (Q3)", async () => {
    const p = await preview([rec("DQ", "100m")])
    expect(p.rows[0]!.status).toBe("warning")
    expect(p.rows[0]!.data).toMatchObject({ time_cs: null, status: "dq", time_raw: "DQ" })
  })

  it("rejects an implausible time rather than storing it", async () => {
    const p = await preview([rec(1.5)])
    expect(p.rows[0]!.status).toBe("rejected")
    expect(p.rows[0]!.issues[0]!.code).toBe("time_implausible_for_race")
  })

  it("rejects an athlete who is not in the registry", async () => {
    const p = await preview([rec(" 15.34", "100m", { no: 99 })])
    expect(p.rows[0]!.issues.map((i) => i.code)).toContain("athlete_not_in_registry")
  })

  it("rejects an unknown race or club", async () => {
    const p = await preview([rec(" 15.34", "400m"), rec(" 15.34", "100m", { club: "نادي مجهول" })])
    expect(p.rows.map((r) => r.status)).toEqual(["rejected", "rejected"])
  })
})
