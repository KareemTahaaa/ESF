/**
 * Reads an uploaded workbook into plain cell values.
 *
 * Macros are never executed: ExcelJS reads the XML parts only and ignores
 * vbaProject.bin. The uploaded bytes are hashed BEFORE parsing, so the hash is
 * of the exact file the federation supplied.
 */

import { createHash } from "node:crypto"
import ExcelJS from "exceljs"
import type { SheetData } from "./types"

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)
const MS_PER_DAY = 86_400_000

/**
 * Converts an ExcelJS cell value to a plain value.
 *
 * Time-of-day cells arrive as a Date on 1899-12-30. They are returned as
 * {hours, minutes, seconds, microseconds} — the shape the legacy time parser
 * accepts — so a race time is never mistaken for a calendar date.
 */
export function plainCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    const ms = value.getTime() - EXCEL_EPOCH_MS
    if (ms >= 0 && ms < MS_PER_DAY) {
      const totalMs = Math.round(ms)
      return {
        hours: Math.floor(totalMs / 3_600_000),
        minutes: Math.floor((totalMs % 3_600_000) / 60_000),
        seconds: Math.floor((totalMs % 60_000) / 1000),
        microseconds: (totalMs % 1000) * 1000,
      }
    }
    return value
  }
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("")
    if ("result" in value) return plainCellValue(value.result as ExcelJS.CellValue)
    if ("text" in value) return value.text
    if ("error" in value) return null
  }
  return value
}

export async function readWorkbook(bytes: Uint8Array): Promise<SheetData[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer)
  const sheets: SheetData[] = []
  workbook.eachSheet((worksheet) => {
    const rows: unknown[][] = []
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values: unknown[] = []
      for (let c = 1; c <= worksheet.columnCount; c++) values.push(plainCellValue(row.getCell(c).value))
      rows[rowNumber - 1] = values
    })
    // eachRow skips trailing gaps; fill holes so row index = Excel row - 1.
    for (let i = 0; i < rows.length; i++) rows[i] ??= []
    sheets.push({ name: worksheet.name, rows })
  })
  return sheets
}
