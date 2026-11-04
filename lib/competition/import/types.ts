/**
 * Shared shapes of the import pipeline — DATA_MIGRATION_MAP.md §7.
 *
 * The parser turns a workbook into PREVIEW rows. Nothing reaches the official
 * tables until a federation admin reviews the preview and commits it, which
 * happens in one database transaction (public.commit_import_batch).
 */

export type ImportRowStatus = "accepted" | "warning" | "needs_review" | "rejected" | "suspected_duplicate"

export interface ImportIssue {
  /** Stable machine code, e.g. `birth_year_missing`. */
  readonly code: string
  /** Arabic message shown to the federation admin. */
  readonly message: string
  /** Column the issue refers to, when there is one. */
  readonly column?: string
}

export interface PreviewRow<D> {
  readonly sheet: string
  /** 1-based row number as Excel shows it. */
  readonly row_number: number
  readonly status: ImportRowStatus
  readonly data: D
  readonly raw: Readonly<Record<string, unknown>>
  readonly issues: readonly ImportIssue[]
}

export interface ImportPreview<D> {
  readonly sheet: string
  readonly rows: readonly PreviewRow<D>[]
  readonly counts: Readonly<Record<ImportRowStatus, number>>
  /** Columns present in the file that the mapping does not use — reported, never silently dropped. */
  readonly unmappedColumns: readonly string[]
  /** Required columns the file does not have. When non-empty the file cannot be imported. */
  readonly missingColumns: readonly string[]
}

/** A sheet read into plain cell values. Row 0 is the header row. */
export interface SheetData {
  readonly name: string
  readonly rows: readonly (readonly unknown[])[]
}

/** Worst status wins when several issues apply to one row. */
const SEVERITY: readonly ImportRowStatus[] = ["accepted", "warning", "needs_review", "suspected_duplicate", "rejected"]

export function worstStatus(statuses: readonly ImportRowStatus[]): ImportRowStatus {
  return statuses.reduce<ImportRowStatus>(
    (worst, s) => (SEVERITY.indexOf(s) > SEVERITY.indexOf(worst) ? s : worst),
    "accepted"
  )
}

export function countStatuses(rows: readonly { status: ImportRowStatus }[]): Record<ImportRowStatus, number> {
  const counts: Record<ImportRowStatus, number> = {
    accepted: 0,
    warning: 0,
    needs_review: 0,
    rejected: 0,
    suspected_duplicate: 0,
  }
  for (const row of rows) counts[row.status] += 1
  return counts
}
