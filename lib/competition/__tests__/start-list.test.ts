/**
 * Start-list generation and the Excel documents. Synthetic athletes only.
 */

import ExcelJS from "exceljs"
import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { SCORE_SHEET_HEADER, START_LIST_HEADER, buildScoreSheetWorkbook, buildStartListWorkbook } from "../export/workbooks"
import { readWorkbook } from "../import/workbook"
import { SEASON_2026_2027 } from "../rules/rulesets/season-2026-2027"
import type { CategoryId, Gender } from "../rules/types"
import { eventNumber, generateStartList, startListAthleteIds, type PreviousRanking, type StartListEntrant } from "../start-list"

function entrant(n: number, categoryId: CategoryId = "senior", gender: Gender = "M"): StartListEntrant {
  return { athleteId: `a${n}`, federationNumber: n, fullName: `لاعب ${n}`, clubCode: "SSC", clubName: "الشمس", categoryId, gender }
}

const ranked = (pairs: [number, number][]) =>
  new Map<string, PreviousRanking>(pairs.map(([n, rank]) => [`a${n}`, { rank, rankRaw: String(rank), needsReview: false }]))

const base = { championship: "qualifications" as const, ruleset: SEASON_2026_2027 }

describe("eventNumber", () => {
  it("numbers category × gender blocks oldest first, girls before boys", () => {
    expect(eventNumber(SEASON_2026_2027, "senior", "F")).toBe(1)
    expect(eventNumber(SEASON_2026_2027, "senior", "M")).toBe(2)
    expect(eventNumber(SEASON_2026_2027, "junior", "F")).toBe(3)
    expect(eventNumber(SEASON_2026_2027, "mini8", "M")).toBe(20)
  })
})

describe("qualification start list", () => {
  it("seeds ranked athletes first, unranked last by federation number, in heats of the Table 9 size", () => {
    // 500m qualification: heats of 4. Ranks: a9 1st, a3 2nd, a7 3rd; a1, a5 unranked.
    const list = generateStartList({
      ...base,
      race: "500m",
      roundKey: "qualification",
      entrants: [1, 3, 5, 7, 9].map((n) => entrant(n)),
      rankings: ranked([
        [9, 1],
        [3, 2],
        [7, 3],
      ]),
    })
    expect(list.official).toBe(true)
    expect(list.groups).toHaveLength(1)
    const heats = list.groups[0]!.heats
    // 5 athletes at 4 per heat -> 3 + 2, serpentine: H1 = seeds 1,4,5 ; H2 = seeds 2,3
    expect(heats.map((h) => h.lanes.map((l) => l.entrant.federationNumber))).toEqual([
      [9, 1, 5],
      [3, 7],
    ])
    expect(heats[0]!.lanes.map((l) => l.lane)).toEqual([1, 2, 3])
  })

  it("is deterministic: entry order does not change the list", () => {
    const entrants = [4, 2, 8, 6, 1].map((n) => entrant(n))
    const a = generateStartList({ ...base, race: "100m", roundKey: "qualification", entrants, rankings: ranked([[8, 1]]) })
    const b = generateStartList({ ...base, race: "100m", roundKey: "qualification", entrants: [...entrants].reverse(), rankings: ranked([[8, 1]]) })
    expect(a).toEqual(b)
  })

  it("separates category and gender into their own events", () => {
    const list = generateStartList({
      ...base,
      race: "200m",
      roundKey: "qualification",
      entrants: [entrant(1, "cadet13", "M"), entrant(2, "cadet13", "F"), entrant(3, "senior", "M")],
      rankings: new Map(),
    })
    expect(list.groups.map((g) => [g.eventNumber, g.categoryId, g.gender])).toEqual([
      [2, "senior", "M"],
      [9, "cadet13", "F"],
      [10, "cadet13", "M"],
    ])
  })

  it("refuses official status when a ranking is unusable (Q2), seeding that athlete as unranked", () => {
    const rankings = new Map<string, PreviousRanking>([["a1", { rank: null, rankRaw: "Heat 3", needsReview: true }]])
    const list = generateStartList({ ...base, race: "middle", roundKey: "qualification", entrants: [entrant(1), entrant(2)], rankings })
    expect(list.official).toBe(false)
    expect(list.blockers.map((b) => b.openQuestion)).toEqual(["Q2"])
  })

  it("lists every entrant exactly once", () => {
    const entrants = Array.from({ length: 23 }, (_, i) => entrant(i + 1, i % 2 ? "youth" : "junior", i % 3 ? "M" : "F"))
    const list = generateStartList({ ...base, race: "one_lap", roundKey: "qualification", entrants, rankings: new Map() })
    expect(startListAthleteIds(list).sort()).toEqual(entrants.map((e) => e.athleteId).sort())
  })

  it("rejects a duplicated entrant", () => {
    expect(() =>
      generateStartList({ ...base, race: "100m", roundKey: "qualification", entrants: [entrant(1), entrant(1)], rankings: new Map() })
    ).toThrow(/twice/)
  })

  it("refuses a round whose field comes from earlier rounds", () => {
    expect(() =>
      generateStartList({ ...base, championship: "national_league", race: "100m", roundKey: "r16", entrants: [entrant(1)], rankings: new Map() })
    ).toThrow(/earlier rounds/)
  })
})

describe("long-distance start list", () => {
  it("is one pack per group, merging ناشئين into شباب (Article 9), listed by federation number", () => {
    const list = generateStartList({
      ...base,
      championship: "national_league",
      race: "points_10000_road",
      roundKey: "race",
      entrants: [entrant(158, "youth"), entrant(186, "junior"), entrant(401, "senior")],
      rankings: new Map(),
    })
    expect(list.groups.map((g) => [g.categoryId, g.heats[0]!.heatNumber, g.heats[0]!.lanes.map((l) => l.entrant.federationNumber)])).toEqual([
      ["senior", null, [401]],
      ["junior", null, [158, 186]],
    ])
  })
})

describe("Excel documents", () => {
  const list = generateStartList({
    ...base,
    race: "one_lap",
    roundKey: "qualification",
    entrants: [entrant(1, "senior", "F"), entrant(2, "senior", "F"), entrant(3, "cadet12", "M")],
    rankings: ranked([[2, 1]]),
  })
  const meta = { title: "جولة التصفيات - موسم 2026-2027", subtitle: "20 نوفمبر 2026", ruleset: SEASON_2026_2027, draft: false }

  it("start list: template columns, one row per athlete in start order", async () => {
    const [sheet] = await readWorkbook(await buildStartListWorkbook(list, meta))
    expect(sheet!.name).toBe("One Lap Road")
    expect(sheet!.rows[0]).toEqual([...START_LIST_HEADER])
    expect(sheet!.rows.slice(1).map((r) => [r[0], r[3], r[7], r[8], r[9]])).toEqual([
      [2, "عمومي", "Event 1", "Heat 1", 1],
      [1, "عمومي", "Event 1", "Heat 1", 2],
      [3, "تحت 12", "Event 12", "Heat 1", 1],
    ])
  })

  it("score sheet: template banners, merged headings, blank time and position, A4 RTL print setup", async () => {
    const bytes = await buildScoreSheetWorkbook(list, meta)
    const [sheet] = await readWorkbook(bytes)
    const firstCells = sheet!.rows.map((r) => r[0])
    expect(firstCells.slice(0, 3)).toEqual([meta.title, meta.subtitle, "One Lap Road"])
    expect(firstCells).toContain("Event 1 - عمومي - بنات")
    expect(firstCells).toContain("Heat 1")
    const headerIndex = sheet!.rows.findIndex((r) => r[0] === "Lane")
    expect(sheet!.rows[headerIndex]).toEqual([...SCORE_SHEET_HEADER])
    expect(sheet!.rows[headerIndex + 1]).toEqual([1, 2, "لاعب 2", "الشمس", null, null])

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]!
    expect(ws.views[0]?.rightToLeft).toBe(true)
    expect(ws.pageSetup.paperSize).toBe(9)
    expect(ws.pageSetup.orientation).toBe("portrait")
    expect(ws.getCell("A1").isMerged && ws.getCell("F1").isMerged).toBe(true)
    expect(ws.columns.map((c) => c.width)).toEqual([7.8, 10.8, 32.8, 20.8, 14.8, 10.8])
  })

  it("marks an unpublished list as not official", async () => {
    const [sheet] = await readWorkbook(await buildScoreSheetWorkbook(list, { ...meta, draft: true }))
    expect(String(sheet!.rows[2]![0])).toMatch(/ليست قائمة رسمية/)
  })

  // Structural comparison with the federation's own score-sheet file, when available locally.
  const template = process.env.SCORE_SHEET_TEMPLATE
  it.skipIf(!template || !existsSync(template))("matches the supplied score-sheet template's header, widths and print setup", async () => {
    const real = new ExcelJS.Workbook()
    await real.xlsx.readFile(template!)
    const ref = real.worksheets.find((w) => w.name === "One Lap Road-A")!
    const ours = new ExcelJS.Workbook()
    await ours.xlsx.load((await buildScoreSheetWorkbook(list, meta)) as unknown as ArrayBuffer)
    const ws = ours.worksheets[0]!
    const headerRow = (w: ExcelJS.Worksheet) => {
      let found: unknown[] = []
      w.eachRow((row) => {
        if (found.length === 0 && row.getCell(1).value === "Lane") found = [1, 2, 3, 4, 5, 6].map((c) => row.getCell(c).value)
      })
      return found
    }
    expect(headerRow(ws)).toEqual(headerRow(ref))
    expect(ws.columns.map((c) => Math.round((c.width ?? 0) * 10))).toEqual(ref.columns.slice(0, 6).map((c) => Math.round((c.width ?? 0) * 10)))
    expect(ws.pageSetup.paperSize).toBe(ref.pageSetup.paperSize)
    expect(ws.pageSetup.orientation).toBe(ref.pageSetup.orientation)
    expect(ws.views[0]?.rightToLeft).toBe(ref.views[0]?.rightToLeft)
  })
})
