/**
 * Start-list and score-sheet workbooks, laid out like the federation's own
 * 2025-26 files (docs/phase-2/SOURCE_MATERIALS_INVENTORY.md §5) so officials
 * can print and use them the way they do today.
 *
 * Deliberate differences from the legacy start list, each for a documented
 * reason: `year` is dropped (a category anchor year that reads like a birth
 * year, DATA_MIGRATION_MAP §6), `first name` / `last name` are dropped (lossy
 * split, §3.1), and `Lane` is added so the start list and score sheet agree.
 */

import ExcelJS from "exceljs"
import type { StartList } from "../start-list"
import type { CategoryId, Gender, RaceCode, SeasonRuleset } from "../rules/types"

export interface DocumentMeta {
  /** Score-sheet title line, e.g. `جولة التصفيات - مدرسة بن مسعود - موسم 2026-2027`. */
  readonly title: string
  /** Second line, normally the date. */
  readonly subtitle: string
  readonly ruleset: SeasonRuleset
  /** True until the start list is published: every sheet then says it is not official. */
  readonly draft: boolean
}

const SHEET_NAME: Readonly<Record<RaceCode, string>> = {
  "100m": "100m Road",
  one_lap: "One Lap Road",
  "200m": "200m Track",
  "500m": "500m Track",
  middle: "800m-1000m Track",
  points_5000_track: "5K Points Track",
  elimination_10000_track: "10K Elimination Track",
  points_10000_road: "10K Points Road",
  elimination_15000_road: "15K Elimination Road",
  relay_3000: "3000m Relay",
}

export function sheetName(race: RaceCode, roundKey: string): string {
  return roundKey === "level_b" ? `${SHEET_NAME[race]}-B` : SHEET_NAME[race]
}

const genderAr = (g: Gender) => (g === "F" ? "بنات" : "بنين")

function categoryAr(ruleset: SeasonRuleset, id: CategoryId): string {
  return ruleset.categories.find((c) => c.id === id)?.nameAr ?? id
}

const DRAFT_NOTICE = "مسودة — ليست قائمة رسمية"

export const START_LIST_HEADER = ["الرقم", "الأسم", "النادي", "المرحلة", "النوع", "Club", "Gender", "Event", "Heat", "Lane"] as const

export async function buildStartListWorkbook(list: StartList, meta: DocumentMeta): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Egypt Skate Federation"
  const ws = wb.addWorksheet(sheetName(list.race, list.roundKey), { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] })
  ws.columns = [
    { width: 7 },
    { width: 30 },
    { width: 16 },
    { width: 12 },
    { width: 7 },
    { width: 7 },
    { width: 7 },
    { width: 10 },
    { width: 8 },
    { width: 6 },
  ]
  ws.addRow([...START_LIST_HEADER]).font = { bold: true }

  for (const group of list.groups) {
    for (const heat of group.heats) {
      for (const lane of heat.lanes) {
        const e = lane.entrant
        ws.addRow([
          e.federationNumber,
          e.fullName,
          e.clubName,
          categoryAr(meta.ruleset, group.categoryId),
          genderAr(e.gender),
          e.clubCode,
          e.gender,
          `Event ${group.eventNumber}`,
          heat.heatNumber === null ? null : `Heat ${heat.heatNumber}`,
          heat.heatNumber === null ? null : lane.lane,
        ])
      }
    }
  }
  if (meta.draft) {
    ws.addRow([])
    ws.addRow([DRAFT_NOTICE]).font = { bold: true, color: { argb: "FFB42318" } }
  }
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

export const SCORE_SHEET_HEADER = ["Lane", "Bib", "Name", "Club", "الزمن", "الترتيب"] as const

export async function buildScoreSheetWorkbook(list: StartList, meta: DocumentMeta): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Egypt Skate Federation"
  const ws = wb.addWorksheet(sheetName(list.race, list.roundKey), {
    views: [{ rightToLeft: true }],
    pageSetup: {
      paperSize: 9, // A4, as the federation's template
      orientation: "portrait",
      horizontalCentered: true,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:4",
    },
  })
  // Column widths from the template: A 7.8, B 10.8, C 32.8, D 20.8, E 14.8, F 10.8.
  ws.columns = [{ width: 7.8 }, { width: 10.8 }, { width: 32.8 }, { width: 20.8 }, { width: 14.8 }, { width: 10.8 }]

  const banner = (text: string, bold = true, size = 12) => {
    const row = ws.addRow([text])
    ws.mergeCells(row.number, 1, row.number, 6)
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" }
    row.getCell(1).font = { bold, size }
    return row
  }
  const thin = { style: "thin" as const }
  const border = { top: thin, left: thin, bottom: thin, right: thin }

  banner(meta.title, true, 14)
  banner(meta.subtitle, false)
  banner(meta.draft ? `${sheetName(list.race, list.roundKey).replace("-B", " - B")} — ${DRAFT_NOTICE}` : sheetName(list.race, list.roundKey).replace("-B", " - B"))
  ws.addRow([])

  for (const group of list.groups) {
    const heading = `${categoryAr(meta.ruleset, group.categoryId)} - ${genderAr(group.gender)}`
    const massStart = group.heats.every((h) => h.heatNumber === null)
    banner(massStart ? heading : `Event ${group.eventNumber} - ${heading}`)
    ws.addRow([])
    for (const heat of group.heats) {
      if (heat.heatNumber !== null) banner(`Heat ${heat.heatNumber}`, true, 11)
      const header = ws.addRow(massStart ? ["No.", ...SCORE_SHEET_HEADER.slice(1)] : [...SCORE_SHEET_HEADER])
      header.font = { bold: true }
      header.eachCell((c) => {
        c.border = border
        c.alignment = { horizontal: "center" }
      })
      for (const lane of heat.lanes) {
        const row = ws.addRow([lane.lane, lane.entrant.federationNumber, lane.entrant.fullName, lane.entrant.clubName, null, null])
        for (let c = 1; c <= 6; c++) row.getCell(c).border = border
        row.getCell(1).alignment = { horizontal: "center" }
        row.getCell(2).alignment = { horizontal: "center" }
        row.height = 20
      }
      ws.addRow([])
    }
  }
  return new Uint8Array(await wb.xlsx.writeBuffer())
}
