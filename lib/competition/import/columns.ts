/**
 * Column lookup by normalised header.
 *
 * Legacy headers carry embedded newlines and inconsistent spacing
 * (`تصنيف One \nLap Road`), so headers are matched after normalisation. Each
 * workbook type declares its own mapping; a column the mapping does not use is
 * reported as unmapped, and a required column that is absent stops the import.
 */

import { CLUBS, type Club } from "../clubs"
import { normaliseArabic, normaliseHeader } from "../arabic"

export interface ColumnSpec {
  /** Normalised header text. */
  readonly header: string
  readonly required?: boolean
  /** Which occurrence, when a header repeats (the Database sheet has `الرقم` twice). */
  readonly occurrence?: number
}

export interface ResolvedColumns<K extends string> {
  readonly index: Readonly<Partial<Record<K, number>>>
  readonly missing: readonly string[]
  readonly unmapped: readonly string[]
}

export function resolveColumns<K extends string>(
  headerRow: readonly unknown[],
  spec: Readonly<Record<K, ColumnSpec>>,
  /** Headers that are known and deliberately not imported (DATA_MIGRATION_MAP §6). */
  ignored: readonly string[] = []
): ResolvedColumns<K> {
  const headers = headerRow.map(normaliseHeader)
  const index: Partial<Record<K, number>> = {}
  const used = new Set<number>()
  const missing: string[] = []

  for (const key of Object.keys(spec) as K[]) {
    const { header, required, occurrence = 1 } = spec[key]
    let seen = 0
    const at = headers.findIndex((h) => h === header && ++seen === occurrence)
    if (at === -1) {
      if (required) missing.push(header)
      continue
    }
    index[key] = at
    used.add(at)
  }

  const ignoredSet = new Set(ignored)
  const unmapped = headers.filter((h, i) => h !== "" && !used.has(i) && !ignoredSet.has(h))
  return { index, missing, unmapped }
}

export function cell(row: readonly unknown[], at: number | undefined): unknown {
  return at === undefined ? null : (row[at] ?? null)
}

export function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).replace(/\s+/g, " ").trim()
  return s === "" ? null : s
}

/** A whole positive integer, or null. `105` and `"105"` are accepted; `10.5` is not. */
export function positiveInteger(value: unknown): number | null {
  const s = text(value)
  if (s === null || !/^\d+$/.test(s)) return null
  const n = Number(s)
  return n > 0 ? n : null
}

const CLUBS_BY_NAME = new Map(CLUBS.map((c) => [normaliseArabic(c.nameAr), c]))

export function clubByName(name: unknown): Club | undefined {
  const s = text(name)
  return s === null ? undefined : CLUBS_BY_NAME.get(normaliseArabic(s))
}

export function clubByCode(code: unknown): Club | undefined {
  const s = text(code)?.toUpperCase()
  return s ? CLUBS.find((c) => c.code === s) : undefined
}
