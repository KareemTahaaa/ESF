/**
 * Historical results import — the `Records` sheet of `Egypt Skate Database.xlsm`.
 * Mapping: DATA_MIGRATION_MAP.md §4.
 *
 * Every time either parses to an exact centisecond value or the row is
 * rejected with the reason; nothing is silently coerced. Status codes (FS, DQ)
 * import with no time and their raw value kept (Q3).
 */

import { normaliseArabic, normaliseHeader } from "../arabic"
import { parseLegacyTime } from "../rules/time"
import type { RaceCode } from "../rules/types"
import { cell, clubByName, positiveInteger, resolveColumns, text, type ColumnSpec } from "./columns"
import { countStatuses, worstStatus, type ImportIssue, type ImportPreview, type ImportRowStatus, type PreviewRow, type SheetData } from "./types"

export interface HistoricalResultData {
  readonly federation_number: number | null
  readonly club_code: string | null
  readonly season: string | null
  readonly event_raw: string | null
  readonly race_code: RaceCode | null
  readonly result_date: string | null
  readonly time_cs: number | null
  readonly time_raw: string
  readonly status: "ok" | "dq" | "fs" | "dns" | "dnf" | null
}

export interface RecordsImportOptions {
  /** Federation numbers in the registry, with names for a consistency check. */
  readonly registry: ReadonlyMap<number, string>
}

type Column = "number" | "name" | "club" | "race" | "event" | "season" | "date" | "time"

const h = normaliseHeader

const COLUMNS: Record<Column, ColumnSpec> = {
  number: { header: h("No"), required: true },
  name: { header: h("Name") },
  club: { header: h("Club"), required: true },
  race: { header: h("Race"), required: true },
  event: { header: h("Event"), required: true },
  season: { header: h("Season"), required: true },
  date: { header: h("Date"), required: true },
  time: { header: h("Time"), required: true },
}

/** Derived or duplicated columns, not imported (category and gender come from the athlete). */
const IGNORED = [h("Age Group"), h("Gender")]

const RACES: Readonly<Record<string, RaceCode>> = {
  "100m": "100m",
  "200m": "200m",
  "500m": "500m",
  "one lap": "one_lap",
  // One legacy race whose distance depends on category (Article 7).
  "800m-1000m": "middle",
}

const issue = (code: string, message: string, column?: string): ImportIssue => ({ code, message, column })

const TIME_FAILURES: Readonly<Record<string, string>> = {
  empty: "الزمن فارغ",
  unrecognised_format: "صيغة الزمن غير معروفة",
  implausible_for_race: "الزمن خارج المدى المعقول لهذا السباق — غالباً خطأ في الإدخال",
  invalid_component: "الزمن يحتوي قيمة مستحيلة (مثل ثوانٍ أكثر من 59)",
}

function isoDate(value: unknown): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null
  return value.toISOString().slice(0, 10)
}

export function previewRecordsImport(sheet: SheetData, options: RecordsImportOptions): ImportPreview<HistoricalResultData> {
  const header = sheet.rows[0] ?? []
  const { index, missing, unmapped } = resolveColumns(header, COLUMNS, [...IGNORED, h("No")])
  if (missing.length > 0) {
    return { sheet: sheet.name, rows: [], counts: countStatuses([]), unmappedColumns: unmapped, missingColumns: missing }
  }

  const rows: PreviewRow<HistoricalResultData>[] = []
  for (let i = 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i] ?? []
    if (row.every((v) => text(v) === null)) continue

    const issues: ImportIssue[] = []
    const statuses: ImportRowStatus[] = []
    const flag = (status: ImportRowStatus, i: ImportIssue) => {
      statuses.push(status)
      issues.push(i)
    }
    const raw: Record<string, unknown> = {}
    header.forEach((label, c) => {
      const v = row[c]
      if (v !== null && v !== undefined && text(label) !== null) raw[`${String(label)}#${c + 1}`] = v
    })

    const federationNumber = positiveInteger(cell(row, index.number))
    if (federationNumber === null) {
      flag("rejected", issue("federation_number_invalid", "رقم اللاعب مفقود أو غير صحيح", "No"))
    } else if (!options.registry.has(federationNumber)) {
      flag("rejected", issue("athlete_not_in_registry", `اللاعب رقم ${federationNumber} غير موجود في سجل الاتحاد`, "No"))
    } else {
      const name = text(cell(row, index.name))
      const registered = options.registry.get(federationNumber)!
      if (name !== null && normaliseArabic(name) !== normaliseArabic(registered)) {
        flag("warning", issue("name_differs", `الاسم في النتيجة «${name}» يختلف عن المسجل «${registered}»`, "Name"))
      }
    }

    const club = clubByName(cell(row, index.club))
    if (!club) flag("rejected", issue("club_unknown", `النادي «${text(cell(row, index.club)) ?? ""}» غير مسجل`, "Club"))

    const raceText = text(cell(row, index.race))
    const race = raceText ? RACES[raceText.toLowerCase()] : undefined
    if (!race) flag("rejected", issue("race_unknown", `السباق «${raceText ?? ""}» غير معروف`, "Race"))

    const seasonMatch = text(cell(row, index.season))?.match(/(\d{4})-(\d{4})/)
    const season = seasonMatch ? `${seasonMatch[1]}-${seasonMatch[2]}` : null
    if (!season) flag("rejected", issue("season_invalid", "الموسم غير مفهوم", "Season"))

    const event = text(cell(row, index.event))
    if (!event) flag("rejected", issue("event_missing", "اسم البطولة مفقود", "Event"))

    const date = isoDate(cell(row, index.date))
    if (!date) flag("rejected", issue("date_invalid", "التاريخ غير صالح", "Date"))

    let timeCs: number | null = null
    let status: HistoricalResultData["status"] = null
    let timeRaw = text(cell(row, index.time)) ?? ""
    if (race) {
      const parsed = parseLegacyTime(cell(row, index.time), race)
      timeRaw = parsed.raw
      if (parsed.ok) {
        timeCs = parsed.centiseconds
        status = "ok"
      } else if (parsed.reason === "status_code" && parsed.status && parsed.status !== "ok" && parsed.status !== "unknown") {
        status = parsed.status
        // Q3: no rule says how these count. Recorded, never scored.
        flag("warning", issue("status_code", `حالة ${parsed.raw.trim()} — لا تحتسب لها نقاط حتى يحدد الاتحاد القاعدة (Q3)`, "Time"))
      } else {
        flag("rejected", issue(`time_${parsed.reason}`, `${TIME_FAILURES[parsed.reason] ?? "زمن غير صالح"}: «${parsed.raw}»`, "Time"))
      }
    }

    rows.push({
      sheet: sheet.name,
      row_number: i + 1,
      status: worstStatus(statuses),
      raw,
      issues,
      data: {
        federation_number: federationNumber,
        club_code: club?.code ?? null,
        season,
        event_raw: event,
        race_code: race ?? null,
        result_date: date,
        time_cs: timeCs,
        time_raw: timeRaw,
        status,
      },
    })
  }

  return { sheet: sheet.name, rows, counts: countStatuses(rows), unmappedColumns: unmapped, missingColumns: [] }
}
