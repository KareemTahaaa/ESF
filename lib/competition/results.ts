/**
 * Results: reading what officials type or fill in on the score sheet, and
 * working out who advances from a round.
 *
 * Times are parsed with the same parser that reads the legacy workbook
 * (rules/time.ts), so `15.34`, `1:50.50`, `1.50.50` and an Excel time cell all
 * mean the same thing everywhere, and an implausible time for the distance is
 * refused rather than stored.
 */

import { findRound, computeAdvancement, type HeatResult } from "./rules/progression"
import { parseLegacyTime } from "./rules/time"
import type { Championship, RaceCode } from "./rules/types"
import { normaliseHeader } from "./arabic"
import type { SheetData } from "./import/types"

export type LineStatus = "ok" | "dns" | "dnf" | "dq" | "fs"

export interface ResultInput {
  readonly athleteId: string
  readonly status: LineStatus
  readonly time: string
  readonly position: string
}

export interface ParsedLine {
  readonly athlete_id: string
  readonly status: LineStatus
  readonly time_cs: number | null
  readonly position: number | null
}

export type ParseOutcome =
  | { readonly ok: true; readonly lines: readonly ParsedLine[] }
  | { readonly ok: false; readonly errors: ReadonlyMap<string, string> }

const TIME_ERRORS: Record<string, string> = {
  unrecognised_format: "صيغة الزمن غير مفهومة (مثال: 15.34 أو 1:50.50)",
  implausible_for_race: "الزمن خارج المدى المعقول لهذه المسافة",
  invalid_component: "الزمن يحتوي قيمة مستحيلة",
}

/**
 * Validates every line. `massStart` races (points, elimination) record a
 * position rather than a time, so either is accepted for a finisher there.
 */
export function parseResultInputs(race: RaceCode, inputs: readonly ResultInput[], massStart: boolean): ParseOutcome {
  const errors = new Map<string, string>()
  const lines: ParsedLine[] = []
  for (const input of inputs) {
    const timeText = input.time.trim()
    const positionText = input.position.trim()
    let timeCs: number | null = null
    let position: number | null = null
    let status = input.status

    if (timeText) {
      const parsed = parseLegacyTime(timeText, race)
      if (parsed.ok) timeCs = parsed.centiseconds
      else if (parsed.reason === "status_code" && parsed.status && parsed.status !== "ok" && parsed.status !== "unknown") {
        // `DQ` typed in the time box is a status, not a time.
        status = parsed.status
      } else {
        errors.set(input.athleteId, TIME_ERRORS[parsed.reason] ?? "زمن غير صالح")
        continue
      }
    }
    if (positionText) {
      if (!/^\d{1,3}$/.test(positionText) || Number(positionText) < 1) {
        errors.set(input.athleteId, "المركز يجب أن يكون رقماً صحيحاً")
        continue
      }
      position = Number(positionText)
    }
    if (status === "ok" && timeCs === null && position === null) {
      errors.set(input.athleteId, massStart ? "اكتب المركز أو الزمن" : "اكتب الزمن، أو اختر حالة (لم يبدأ، لم يكمل، استبعاد)")
      continue
    }
    if (status === "dns") {
      timeCs = null
      position = null
    }
    lines.push({ athlete_id: input.athleteId, status, time_cs: timeCs, position })
  }
  return errors.size > 0 ? { ok: false, errors } : { ok: true, lines }
}

export interface ScoreSheetRow {
  readonly federationNumber: number
  readonly time: unknown
  readonly position: unknown
}

/**
 * Reads a filled-in score sheet in the layout this system generates
 * (export/workbooks.ts): under each `Lane | Bib | Name | Club | الزمن | الترتيب`
 * header, one row per athlete. Rows are matched by bib (federation number),
 * never by name.
 */
export function readScoreSheet(sheet: SheetData): ScoreSheetRow[] {
  const rows: ScoreSheetRow[] = []
  let inBlock = false
  for (const row of sheet.rows) {
    const first = normaliseHeader(row[0])
    if (first === "lane" || first === "no.") {
      inBlock = normaliseHeader(row[1]) === "bib"
      continue
    }
    const bib = row[1]
    const number = typeof bib === "number" ? bib : typeof bib === "string" && /^\d+$/.test(bib.trim()) ? Number(bib) : null
    if (!inBlock || number === null || typeof row[0] !== "number") continue
    rows.push({ federationNumber: number, time: row[4] ?? null, position: row[5] ?? null })
  }
  return rows
}

/** Converts a score-sheet cell to the text an official would have typed. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object" && value !== null && "hours" in value) {
    const t = value as { hours: number; minutes: number; seconds: number; microseconds: number }
    const cs = Math.round(t.microseconds / 10000)
    const total = t.hours * 60 + t.minutes
    return `${total}:${String(t.seconds).padStart(2, "0")}.${String(cs).padStart(2, "0")}`
  }
  return String(value).trim()
}

export interface QualificationLine {
  readonly athleteId: string
  readonly eventNumber: number
  readonly heatNumber: number | null
  readonly status: LineStatus
  readonly timeCs: number | null
  readonly position: number | null
}

export interface GroupOutcome {
  readonly eventNumber: number
  readonly advancing: readonly string[]
  readonly eliminated: readonly string[]
  /** Each athlete's heat and finishing position, as used to decide the above. */
  readonly heatResults: readonly HeatResult[]
}

export interface QualificationOutcome {
  readonly groups: readonly GroupOutcome[]
  /** False when an unresolved rule affects who qualifies. */
  readonly official: boolean
  readonly blockers: readonly { readonly openQuestion: string; readonly detail: string }[]
}

/**
 * Who advances from a round, per category × gender event, using the bracket
 * definition for the race in rules/progression.ts (e.g. best 16 times, or 1st
 * and 2nd of each heat). Nothing about advancement is decided here.
 */
export function roundOutcome(championship: Championship, race: RaceCode, roundKey: string, lines: readonly QualificationLine[]): QualificationOutcome {
  const round = findRound(championship, race, roundKey)
  const blockers: { openQuestion: string; detail: string }[] = []

  const byEvent = new Map<number, QualificationLine[]>()
  for (const l of lines) byEvent.set(l.eventNumber, [...(byEvent.get(l.eventNumber) ?? []), l])

  const groups: GroupOutcome[] = []
  for (const [eventNumber, group] of [...byEvent.entries()].sort((a, b) => a[0] - b[0])) {
    // DNS / DNF / DQ / FS go to the bottom of the ranking (Q3), whatever
    // position was typed; equal times and shared places share the rank (Q6).
    const heatResults: HeatResult[] = group.map((l) => ({
      heatNumber: l.heatNumber ?? 1,
      athleteId: l.athleteId,
      positionInHeat: l.status === "ok" ? (l.position ?? positionFromTime(group, l)) : Number.MAX_SAFE_INTEGER,
      timeCentiseconds: l.status === "ok" ? l.timeCs : null,
    }))
    const result = computeAdvancement(round, heatResults)
    groups.push({ eventNumber, advancing: result.advancing, eliminated: result.eliminated, heatResults })
  }
  return { groups, official: blockers.length === 0, blockers }
}

/** Who qualifies from a Qualifications round (e.g. best 16 times). */
export function qualificationOutcome(race: RaceCode, lines: readonly QualificationLine[], championship: Championship = "qualifications"): QualificationOutcome {
  return roundOutcome(championship, race, "qualification", lines)
}

/** Position within the heat by time, when officials recorded only times. */
function positionFromTime(group: readonly QualificationLine[], line: QualificationLine): number {
  if (line.status !== "ok" || line.timeCs === null) return Number.MAX_SAFE_INTEGER
  const sameHeat = group.filter((l) => l.heatNumber === line.heatNumber && l.status === "ok" && l.timeCs !== null)
  return sameHeat.filter((l) => l.timeCs! < line.timeCs!).length + 1
}
