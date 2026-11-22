import { describe, expect, it } from "vitest"
import { buildScoreSheetWorkbook } from "../export/workbooks"
import { readWorkbook } from "../import/workbook"
import { cellText, parseResultInputs, qualificationOutcome, readScoreSheet, type QualificationLine } from "../results"
import { SEASON_2026_2027 } from "../rules/rulesets/season-2026-2027"
import { generateStartList } from "../start-list"
import ExcelJS from "exceljs"

const input = (athleteId: string, time: string, status: "ok" | "dns" | "dnf" | "dq" | "fs" = "ok", position = "") => ({
  athleteId,
  time,
  status,
  position,
})

describe("parseResultInputs", () => {
  it("parses the same time formats as the legacy import", () => {
    const r = parseResultInputs("middle", [input("a", "1:50.50"), input("b", "1.50.50"), input("c", "2.52.5")], false)
    expect(r.ok && r.lines.map((l) => l.time_cs)).toEqual([11050, 11050, 17250])
  })

  it("refuses an implausible time for the distance instead of storing it", () => {
    const r = parseResultInputs("100m", [input("a", "1.5")], false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.get("a")).toMatch(/المدى المعقول/)
  })

  it("treats DQ typed in the time box as a status", () => {
    const r = parseResultInputs("100m", [input("a", "DQ")], false)
    expect(r.ok && r.lines[0]).toEqual({ athlete_id: "a", status: "dq", time_cs: null, position: null })
  })

  it("requires a time from a finisher in a timed race, and clears both for a non-starter", () => {
    const r = parseResultInputs("200m", [input("a", ""), input("b", "20.00", "dns")], false)
    expect(r.ok).toBe(false)
    const ok = parseResultInputs("200m", [input("b", "20.00", "dns")], false)
    expect(ok.ok && ok.lines[0]).toEqual({ athlete_id: "b", status: "dns", time_cs: null, position: null })
  })

  it("accepts a position alone in a mass-start race", () => {
    const r = parseResultInputs("points_10000_road", [input("a", "", "ok", "3")], true)
    expect(r.ok && r.lines[0]!.position).toBe(3)
  })
})

describe("qualificationOutcome", () => {
  const line = (id: string, ev: number, heat: number, time: number | null, status: QualificationLine["status"] = "ok"): QualificationLine => ({
    athleteId: id,
    eventNumber: ev,
    heatNumber: heat,
    status,
    timeCs: time,
    position: null,
  })

  it("takes the best 12 times per event for the 200m (catalogue row 1)", () => {
    const lines = Array.from({ length: 14 }, (_, i) => line(`a${i + 1}`, 1, (i % 3) + 1, 2000 + i * 10))
    const out = qualificationOutcome("200m", lines)
    expect(out.official).toBe(true)
    expect(out.groups[0]!.advancing).toEqual(lines.slice(0, 12).map((l) => l.athleteId))
    expect(out.groups[0]!.eliminated).toEqual(["a13", "a14"])
  })

  it("keeps events apart", () => {
    const out = qualificationOutcome("100m", [line("g1", 1, 1, 1500), line("b1", 2, 1, 1400)])
    expect(out.groups.map((g) => [g.eventNumber, g.advancing])).toEqual([
      [1, ["g1"]],
      [2, ["b1"]],
    ])
  })

  it("puts DNS/DQ at the bottom of the ranking (Q3) and stays official", () => {
    const outcome = qualificationOutcome("100m", [line("b", 1, 1, null, "dq"), line("a", 1, 1, 1600), line("c", 1, 2, 1500)])
    expect(outcome.official).toBe(true)
    expect(outcome.groups[0]!.advancing).toEqual(["c", "a", "b"])
  })

  it("lets a tie on the last qualifying place take both through (Q6)", () => {
    // Best 16 qualify; athletes 16 and 17 share 16th place.
    const lines = Array.from({ length: 18 }, (_, i) => line(`a${i + 1}`, 1, (i % 9) + 1, i < 16 ? 1500 + i : i === 16 ? 1515 : 1600))
    const outcome = qualificationOutcome("100m", lines)
    expect(outcome.official).toBe(true)
    expect(outcome.groups[0]!.advancing).toHaveLength(17)
    expect(outcome.groups[0]!.eliminated).toEqual(["a18"])
  })
})

describe("readScoreSheet", () => {
  it("reads back a score sheet this system generated and an official filled in", async () => {
    const list = generateStartList({
      championship: "qualifications",
      race: "100m",
      roundKey: "qualification",
      ruleset: SEASON_2026_2027,
      rankings: new Map(),
      entrants: [1, 2, 3].map((n) => ({
        athleteId: `a${n}`,
        federationNumber: 100 + n,
        fullName: `لاعب ${n}`,
        clubCode: "SSC",
        clubName: "الشمس",
        categoryId: "senior" as const,
        gender: "M" as const,
      })),
    })
    const bytes = await buildScoreSheetWorkbook(list, { title: "t", subtitle: "s", ruleset: SEASON_2026_2027, draft: false })
    // An official fills in the time column by hand.
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]!
    ws.eachRow((row) => {
      if (row.getCell(2).value === 101) row.getCell(5).value = 15.34
      if (row.getCell(2).value === 102) row.getCell(5).value = "DQ"
      if (row.getCell(2).value === 103) row.getCell(5).value = " 16.10"
    })
    const filled = new Uint8Array(await wb.xlsx.writeBuffer())
    const [sheet] = await readWorkbook(filled)
    const rows = readScoreSheet(sheet!)
    expect(rows.map((r) => [r.federationNumber, cellText(r.time)]).sort()).toEqual([
      [101, "15.34"],
      [102, "DQ"],
      [103, "16.10"],
    ])
  })

  it("formats an Excel time cell as an official would type it", () => {
    expect(cellText({ hours: 0, minutes: 1, seconds: 0, microseconds: 910000 })).toBe("1:00.91")
  })
})
