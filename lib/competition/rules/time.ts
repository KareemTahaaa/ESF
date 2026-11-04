/**
 * Legacy race-time parsing and normalisation.
 *
 * The legacy `Records` sheet of `Egypt Skate Database.xlsm` stores times in
 * ELEVEN distinct formats across four spreadsheet types. Measured distribution
 * over all 3476 rows (see docs/phase-2/DATA_MIGRATION_MAP.md §4.1):
 *
 *   number  15.34         992   decimal seconds
 *   number  48             37   integer seconds
 *   string  " 15.34"     1109   decimal seconds, leading space
 *   string  " 16.8"        12   one decimal place
 *   string  "'14.11"        1   Excel text-escape apostrophe
 *   string  " 1:00.89"    201   M:SS.hh
 *   string  "1.50.50"     759   M.SS.hh  <-- dot-separated minutes
 *   string  "2.52.5"        6   M.SS.h
 *   string  "1,39.88"       1   comma minute separator
 *   Excel   time serial   356   fraction of a day
 *   string  "FS" / "DQ"     2   status codes, not times
 *
 * The canonical form is an integer count of CENTISECONDS: all source precision
 * is 0.01s, and integers avoid float drift when sorting and comparing times.
 *
 * The dangerous case is `"1.50.50"`. A careless `parseFloat` yields 1.5 — a
 * plausible-looking 1.5 second time for an 800m race. Disambiguation is
 * structural (count the dots), and every parse is additionally checked against
 * a per-race plausibility band so a misparse is rejected rather than stored.
 */

import type { RaceCode, ResultStatus } from "./types"

export type ParsedTime =
  | { readonly ok: true; readonly centiseconds: number; readonly raw: string }
  | { readonly ok: false; readonly reason: TimeParseFailure; readonly raw: string; readonly status?: ResultStatus }

export type TimeParseFailure =
  /** The cell is a recognised status code (FS, DQ, …), not a time. */
  | "status_code"
  /** Empty or whitespace-only cell. */
  | "empty"
  /** Not in any recognised format. */
  | "unrecognised_format"
  /** Parsed, but outside the plausible range for the race — likely a misparse. */
  | "implausible_for_race"
  /** Structurally valid but semantically impossible, e.g. 90 seconds in a minute. */
  | "invalid_component"

/**
 * Status codes present in the legacy data. Their SPORTING effect is undefined
 * by the regulations (OPEN_QUESTIONS Q3), so they are recorded, never scored.
 */
const STATUS_CODES: Readonly<Record<string, ResultStatus>> = {
  FS: "fs",
  DQ: "dq",
  DNS: "dns",
  DNF: "dnf",
}

/**
 * Plausibility bands in centiseconds, per race.
 *
 * Lower and upper bounds are set generously around the ranges actually observed
 * in the 3476 legacy rows, so genuine outliers pass but a misparse by a factor
 * of 60 or 100 cannot. Observed: 100m 9.50-22.94s, 200m 18.63-42.56s,
 * 500m 43.65-59.94s, One Lap 37.04-75.60s, 800m-1000m minute-scale only.
 */
const PLAUSIBLE_BANDS: Readonly<Partial<Record<RaceCode, readonly [number, number]>>> = {
  "100m": [800, 4000], //   8s -  40s
  "200m": [1500, 8000], //  15s -  80s
  "500m": [3500, 15000], // 35s - 150s
  one_lap: [3000, 18000], // 30s - 180s
  middle: [6000, 60000], //  60s - 600s
}

const CENTISECONDS_PER_SECOND = 100
const CENTISECONDS_PER_MINUTE = 60 * CENTISECONDS_PER_SECOND
const CENTISECONDS_PER_HOUR = 60 * CENTISECONDS_PER_MINUTE
const CENTISECONDS_PER_DAY = 24 * CENTISECONDS_PER_HOUR

/** An Excel time serial is a fraction of a day; a full day is the exclusive upper bound. */
const MAX_EXCEL_TIME_SERIAL = 1

/**
 * Converts a fractional-seconds value to centiseconds, rounding to the nearest
 * centisecond. Rounding (not truncation) matters: 0.000706018518... of a day is
 * 61.0000..s and must become 6100, not 6099.
 */
function toCentiseconds(seconds: number): number {
  return Math.round(seconds * CENTISECONDS_PER_SECOND)
}

/** Parses the `SS.hh` fractional-second component of a composite time. */
function parseSecondsComponent(text: string): number | null {
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/**
 * Parses one legacy time cell.
 *
 * `race` is required because plausibility is race-dependent: 61 seconds is a
 * normal 500m and an impossible 100m.
 */
export function parseLegacyTime(value: unknown, race: RaceCode): ParsedTime {
  const raw = formatRaw(value)

  if (value === null || value === undefined) {
    return { ok: false, reason: "empty", raw }
  }

  // --- Excel time serial, surfaced by the reader as a fraction of a day ------
  // Handled before the generic number branch: a bare 0.000706 is a time serial,
  // not a 0.0007 second race.
  if (typeof value === "number" && value > 0 && value < MAX_EXCEL_TIME_SERIAL) {
    return finalise(Math.round(value * CENTISECONDS_PER_DAY), raw, race)
  }

  // --- Plain numeric seconds (992 floats + 37 ints) -------------------------
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, reason: "invalid_component", raw }
    }
    return finalise(toCentiseconds(value), raw, race)
  }

  // --- Excel time objects, if the reader yields {hours,minutes,seconds} -----
  if (typeof value === "object" && value !== null && "hours" in value) {
    const t = value as { hours?: number; minutes?: number; seconds?: number; microseconds?: number }
    const cs =
      (t.hours ?? 0) * CENTISECONDS_PER_HOUR +
      (t.minutes ?? 0) * CENTISECONDS_PER_MINUTE +
      (t.seconds ?? 0) * CENTISECONDS_PER_SECOND +
      Math.round((t.microseconds ?? 0) / 10000)
    return finalise(cs, raw, race)
  }

  if (typeof value !== "string") {
    return { ok: false, reason: "unrecognised_format", raw }
  }

  // Trim, and strip the Excel text-escape apostrophe (`'14.11`).
  const text = value.trim().replace(/^'/, "").trim()

  if (text === "") {
    return { ok: false, reason: "empty", raw }
  }

  // --- Status codes ---------------------------------------------------------
  const status = STATUS_CODES[text.toUpperCase()]
  if (status) {
    return { ok: false, reason: "status_code", raw, status }
  }

  // Normalise the comma minute separator (`1,39.88`) to a dot before counting.
  const normalised = text.replace(/,/g, ".")

  // --- M:SS.hh — colon is unambiguous --------------------------------------
  const colon = normalised.match(/^(\d{1,3}):(\d{1,2}(?:\.\d{1,2})?)$/)
  if (colon) {
    const minutes = Number(colon[1])
    const seconds = parseSecondsComponent(colon[2]!)
    if (seconds === null || seconds >= 60) {
      return { ok: false, reason: "invalid_component", raw }
    }
    return finalise(minutes * CENTISECONDS_PER_MINUTE + toCentiseconds(seconds), raw, race)
  }

  const dotCount = (normalised.match(/\./g) ?? []).length

  // --- M.SS.hh / M.SS.h — TWO dots means minute.second.centisecond ---------
  // This is the trap: parseFloat("1.50.50") would give 1.5.
  if (dotCount === 2) {
    const parts = normalised.split(".")
    const [minutePart, secondPart, fractionPart] = parts as [string, string, string]
    if (!/^\d{1,3}$/.test(minutePart) || !/^\d{1,2}$/.test(secondPart) || !/^\d{1,2}$/.test(fractionPart)) {
      return { ok: false, reason: "unrecognised_format", raw }
    }
    const seconds = Number(secondPart)
    if (seconds >= 60) {
      return { ok: false, reason: "invalid_component", raw }
    }
    // A single fraction digit is tenths: "2.52.5" is 2:52.50, not 2:52.05.
    const centis = fractionPart.length === 1 ? Number(fractionPart) * 10 : Number(fractionPart)
    return finalise(
      Number(minutePart) * CENTISECONDS_PER_MINUTE + seconds * CENTISECONDS_PER_SECOND + centis,
      raw,
      race
    )
  }

  // --- SS.hh / SS — plain decimal seconds ----------------------------------
  if (dotCount <= 1 && /^\d{1,3}(\.\d{1,2})?$/.test(normalised)) {
    return finalise(toCentiseconds(Number(normalised)), raw, race)
  }

  return { ok: false, reason: "unrecognised_format", raw }
}

/** Applies the per-race plausibility band. A band-violating value is rejected, never stored. */
function finalise(centiseconds: number, raw: string, race: RaceCode): ParsedTime {
  if (!Number.isFinite(centiseconds) || centiseconds <= 0) {
    return { ok: false, reason: "invalid_component", raw }
  }
  const band = PLAUSIBLE_BANDS[race]
  if (band && (centiseconds < band[0] || centiseconds > band[1])) {
    return { ok: false, reason: "implausible_for_race", raw }
  }
  return { ok: true, centiseconds, raw }
}

function formatRaw(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") {
    if ("hours" in value) {
      const t = value as { hours?: number; minutes?: number; seconds?: number; microseconds?: number }
      return `${t.hours ?? 0}:${t.minutes ?? 0}:${t.seconds ?? 0}.${t.microseconds ?? 0}`
    }
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * Formats centiseconds for display and for generated documents.
 * Under a minute: `15.34`. A minute or more: `1:50.50` — the colon form used in
 * the official score sheets.
 */
export function formatTime(centiseconds: number): string {
  if (!Number.isInteger(centiseconds) || centiseconds < 0) {
    throw new Error(`Cannot format invalid time: ${centiseconds}`)
  }
  const minutes = Math.floor(centiseconds / CENTISECONDS_PER_MINUTE)
  const remainder = centiseconds % CENTISECONDS_PER_MINUTE
  const seconds = Math.floor(remainder / CENTISECONDS_PER_SECOND)
  const centis = remainder % CENTISECONDS_PER_SECOND

  if (minutes === 0) {
    return `${seconds}.${String(centis).padStart(2, "0")}`
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`
}

/** The plausibility band for a race, exposed for import reporting. */
export function plausibleBandFor(race: RaceCode): readonly [number, number] | undefined {
  return PLAUSIBLE_BANDS[race]
}
