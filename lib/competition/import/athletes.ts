/**
 * Athlete registry import — the `Database` sheet of `Egypt Skate Database.xlsm`.
 * Mapping: DATA_MIGRATION_MAP.md §3 and §4.4.
 *
 * Produces a preview only. Matching to existing athletes is on the federation
 * number alone; a similar name never merges two records, it only queues them
 * for review.
 *
 * Federation instruction (2026-11-03): a player whose record is incomplete or
 * wrong is not imported at all — no birth year, no name, no gender, unknown
 * club, a category that contradicts the birth year, a duplicate. A ranking
 * value that cannot be read (e.g. `Heat 5` in the Cup 800/1000m column, Q2) is
 * left out and the player is imported without it, so they are seeded as having
 * no previous ranking (Q7).
 */

import { normaliseArabic, normaliseHeader } from "../arabic"
import { assignCategory, findCategoryByArabicName } from "../rules/age-category"
import type { Championship, ClassificationLevel, RaceCode, SeasonRuleset } from "../rules/types"
import { cell, clubByCode, clubByName, positiveInteger, resolveColumns, text, type ColumnSpec } from "./columns"
import {
  countStatuses,
  worstStatus,
  type ImportIssue,
  type ImportPreview,
  type ImportRowStatus,
  type PreviewRow,
  type SheetData,
} from "./types"

export interface RankingData {
  readonly race_code: RaceCode
  readonly championship: Championship
  readonly classification_level: ClassificationLevel | null
  readonly rank: number | null
  readonly rank_raw: string | null
  readonly needs_review: boolean
}

export interface AthleteData {
  readonly federation_number: number | null
  readonly registration_number: string | null
  readonly full_name_ar: string | null
  readonly name_normalised: string | null
  readonly birth_year: number | null
  readonly gender: "M" | "F" | null
  readonly club_code: string | null
  readonly rankings_season: string
  readonly rankings: readonly RankingData[]
}

/** An athlete already in the registry, for update and duplicate checks. */
export interface ExistingAthlete {
  readonly federationNumber: number
  readonly fullNameAr: string
  readonly nameNormalised: string
  readonly birthYear: number | null
}

export interface AthleteImportOptions {
  /** The season being registered for; categories are verified against it. */
  readonly ruleset: SeasonRuleset
  /** The season the ranking columns come from (the one before `ruleset`). */
  readonly rankingsSeason: string
  readonly existing?: readonly ExistingAthlete[]
}

type Column =
  | "federationNumber"
  | "federationNumberCopy"
  | "registrationNumber"
  | "fullName"
  | "clubName"
  | "clubCode"
  | "birthYear"
  | "genderCode"
  | "genderAr"
  | "categoryCurrent"

const h = normaliseHeader

const COLUMNS: Record<Column, ColumnSpec> = {
  federationNumber: { header: h("الرقم"), required: true },
  federationNumberCopy: { header: h("الرقم"), occurrence: 2 },
  registrationNumber: { header: h("رقم التسجيل") },
  fullName: { header: h("الأسم"), required: true },
  clubName: { header: h("النادي") },
  clubCode: { header: h("Club") },
  birthYear: { header: h("YOB"), required: true },
  genderCode: { header: h("Gender") },
  genderAr: { header: h("النوع") },
  categoryCurrent: { header: h("المرحلة 2026-2027") },
}

/** Ranking columns — DATA_MIGRATION_MAP §4.4. */
const RANKING_COLUMNS: readonly {
  readonly race: RaceCode
  readonly championship: Championship
  readonly level?: string
  readonly rank?: string
}[] = [
  { race: "100m", championship: "national_league", level: h("تصنيف 100m Road"), rank: h("ترتيب 100m Road") },
  { race: "200m", championship: "national_league", level: h("تصنيف 200m Track"), rank: h("ترتيب 200m Track") },
  { race: "one_lap", championship: "national_league", level: h("تصنيف One Lap Road"), rank: h("ترتيب One Lap Road") },
  { race: "500m", championship: "national_league", level: h("تصنيف 500m Track"), rank: h("ترتيب 500m Track") },
  {
    race: "middle",
    championship: "national_league",
    level: h("تصنيف 800m-1000m Track"),
    rank: h("ترتيب 800m-1000m Track League"),
  },
  // Q2: 138 values in this column are `Heat N`, not ranks.
  { race: "middle", championship: "egypt_cup", rank: h("ترتيب 800m-1000m Track Cup") },
]

/** Known columns that are deliberately not imported — DATA_MIGRATION_MAP §6. */
const IGNORED = [h("المرحلة 2025-2026"), h("first name"), h("last name"), h("Age Group Code")]

const issue = (code: string, message: string, column?: string): ImportIssue => ({ code, message, column })

function parseGender(code: unknown, arabic: unknown): { gender: "M" | "F" | null; conflict: boolean } {
  const fromCode = text(code)?.toUpperCase()
  const fromAr = text(arabic)
  const a = fromCode === "M" || fromCode === "F" ? fromCode : null
  const b = fromAr === "بنين" ? "M" : fromAr === "بنات" ? "F" : null
  if (a && b && a !== b) return { gender: null, conflict: true }
  return { gender: a ?? b, conflict: false }
}

export function previewAthleteImport(sheet: SheetData, options: AthleteImportOptions): ImportPreview<AthleteData> {
  const header = sheet.rows[0] ?? []
  const rankingHeaders = RANKING_COLUMNS.flatMap((r) => [r.level, r.rank]).filter((x): x is string => Boolean(x))
  const { index, missing, unmapped } = resolveColumns(header, COLUMNS, [...IGNORED, ...rankingHeaders])
  const headers = header.map(normaliseHeader)

  if (missing.length > 0) {
    return { sheet: sheet.name, rows: [], counts: countStatuses([]), unmappedColumns: unmapped, missingColumns: missing }
  }

  const rows: { status: ImportRowStatus; data: AthleteData; raw: Record<string, unknown>; issues: ImportIssue[]; n: number }[] = []

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
      if (v !== null && v !== undefined && text(label) !== null) raw[String(label)] = v
    })

    const federationNumber = positiveInteger(cell(row, index.federationNumber))
    if (federationNumber === null) {
      flag("rejected", issue("federation_number_invalid", "رقم اللاعب في الاتحاد مفقود أو غير صحيح", "الرقم"))
    }
    const copy = cell(row, index.federationNumberCopy)
    if (index.federationNumberCopy !== undefined && text(copy) !== null && positiveInteger(copy) !== federationNumber) {
      flag("rejected", issue("federation_number_conflict", "عمودا «الرقم» في الصف غير متطابقين", "الرقم"))
    }

    const fullName = text(cell(row, index.fullName))
    if (fullName === null) flag("rejected", issue("name_missing", "اسم اللاعب مفقود", "الأسم"))

    const { gender, conflict } = parseGender(cell(row, index.genderCode), cell(row, index.genderAr))
    if (conflict) flag("rejected", issue("gender_conflict", "عمودا النوع (Gender / النوع) متعارضان", "Gender"))
    else if (gender === null) flag("rejected", issue("gender_missing", "النوع غير محدد", "Gender"))

    const byName = clubByName(cell(row, index.clubName))
    const byCode = clubByCode(cell(row, index.clubCode))
    const clubText = text(cell(row, index.clubName)) ?? text(cell(row, index.clubCode))
    if (byName && byCode && byName.code !== byCode.code) {
      flag("rejected", issue("club_conflict", `اسم النادي «${byName.nameAr}» لا يطابق الكود ${byCode.code}`, "النادي"))
    } else if (!byName && !byCode) {
      flag(
        "rejected",
        issue("club_unknown", clubText ? `النادي «${clubText}» غير مسجل في الاتحاد` : "النادي غير محدد", "النادي")
      )
    }
    const club = byName ?? byCode

    const yobRaw = cell(row, index.birthYear)
    let birthYear: number | null = null
    if (text(yobRaw) === null) {
      // Q14: incomplete records are not imported (federation instruction, 2026-11-03).
      flag("rejected", issue("birth_year_missing", "سنة الميلاد غير مسجلة — لن يُستورد اللاعب حتى تُستكمل بياناته", "YOB"))
    } else {
      const y = positiveInteger(yobRaw)
      if (y === null || y < 1920 || y > 2030) {
        flag("rejected", issue("birth_year_invalid", `سنة الميلاد «${text(yobRaw)}» غير صالحة`, "YOB"))
      } else {
        birthYear = y
      }
    }

    // Category is DERIVED, never imported. The sheet's own column is a check
    // on the rules engine: a disagreement stops the row (§3.2).
    const sheetCategory = text(cell(row, index.categoryCurrent))
    if (birthYear !== null && sheetCategory !== null) {
      const computed = assignCategory(birthYear, options.ruleset)
      const stated = findCategoryByArabicName(sheetCategory, options.ruleset)
      if (!computed.resolved || !stated || computed.category.id !== stated.id) {
        flag(
          "rejected",
          issue(
            "category_mismatch",
            `المرحلة في الملف «${sheetCategory}» لا تطابق المرحلة المحسوبة من سنة الميلاد ${birthYear}` +
              (computed.resolved ? ` («${computed.category.nameAr}»)` : ""),
            "المرحلة 2026-2027"
          )
        )
      }
    }

    const rankings: RankingData[] = []
    for (const spec of RANKING_COLUMNS) {
      const levelRaw = spec.level ? text(row[headers.indexOf(spec.level)]) : null
      const rankRaw = spec.rank ? text(row[headers.indexOf(spec.rank)]) : null
      if (levelRaw === null && rankRaw === null) continue

      // An unreadable value is left out, never coerced: `Heat 5` is not rank 5 (Q2).
      let level: ClassificationLevel | null = null
      if (levelRaw !== null) {
        const up = levelRaw.toUpperCase()
        if (up === "A" || up === "B") level = up
        else flag("warning", issue("classification_invalid", `تصنيف غير مفهوم «${levelRaw}» — لن يُستورد هذا التصنيف`, spec.level))
      }
      let rank: number | null = null
      if (rankRaw !== null) {
        rank = positiveInteger(rankRaw)
        if (rank === null) {
          flag("warning", issue("rank_invalid", `ترتيب غير رقمي «${rankRaw}» — لن يُستورد هذا الترتيب`, spec.rank))
        }
      }
      if (level === null && rank === null) continue
      rankings.push({
        race_code: spec.race,
        championship: spec.championship,
        classification_level: level,
        rank,
        rank_raw: rank === null ? null : rankRaw,
        needs_review: false,
      })
    }

    rows.push({
      n: i + 1,
      status: worstStatus(statuses),
      raw,
      issues,
      data: {
        federation_number: federationNumber,
        registration_number: text(cell(row, index.registrationNumber)),
        full_name_ar: fullName,
        name_normalised: fullName ? normaliseArabic(fullName) : null,
        birth_year: birthYear,
        gender,
        club_code: club?.code ?? null,
        rankings_season: options.rankingsSeason,
        rankings,
      },
    })
  }

  // Duplicate federation numbers inside the file: the first stands, the rest
  // are rejected. Verified zero in the legacy file, so any hit is a real error.
  const firstRowFor = new Map<number, number>()
  for (const r of rows) {
    const n = r.data.federation_number
    if (n === null) continue
    const first = firstRowFor.get(n)
    if (first === undefined) firstRowFor.set(n, r.n)
    else {
      r.issues.push(issue("federation_number_duplicate", `الرقم ${n} مكرر — ورد أولاً في الصف ${first}`, "الرقم"))
      r.status = "rejected"
    }
  }

  // Possible duplicates: same normalised name and birth year under DIFFERENT
  // federation numbers. Held for a federation decision; never merged.
  const existing = options.existing ?? []
  const existingByNumber = new Map(existing.map((e) => [e.federationNumber, e]))
  const byIdentity = new Map<string, number[]>()
  const identity = (name: string, year: number | null) => `${name}|${year ?? "?"}`
  for (const e of existing) {
    const key = identity(e.nameNormalised, e.birthYear)
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), e.federationNumber])
  }
  for (const r of rows) {
    if (r.data.name_normalised === null || r.data.federation_number === null || r.status === "rejected") continue
    const key = identity(r.data.name_normalised, r.data.birth_year)
    byIdentity.set(key, [...new Set([...(byIdentity.get(key) ?? []), r.data.federation_number])])
  }
  for (const r of rows) {
    if (r.data.name_normalised === null || r.data.federation_number === null || r.status === "rejected") continue
    if (r.data.birth_year === null) continue
    const others = (byIdentity.get(identity(r.data.name_normalised, r.data.birth_year)) ?? []).filter(
      (n) => n !== r.data.federation_number
    )
    if (others.length > 0) {
      r.issues.push(
        issue(
          "possible_duplicate",
          `قد يكون نفس اللاعب المسجل برقم ${others.join("، ")} (نفس الاسم وسنة الميلاد) — لن يُستورد حتى يقرر الاتحاد`
        )
      )
      r.status = worstStatus([r.status, "suspected_duplicate"])
    }

    const current = existingByNumber.get(r.data.federation_number)
    if (current && r.status !== "suspected_duplicate" && current.fullNameAr !== r.data.full_name_ar) {
      r.issues.push(issue("will_update", `سيُحدَّث الاسم المسجل «${current.fullNameAr}»`, "الأسم"))
      r.status = worstStatus([r.status, "warning"])
    }
  }

  const previewRows: PreviewRow<AthleteData>[] = rows.map((r) => ({
    sheet: sheet.name,
    row_number: r.n,
    status: r.status,
    data: r.data,
    raw: r.raw,
    issues: r.issues,
  }))
  return {
    sheet: sheet.name,
    rows: previewRows,
    counts: countStatuses(previewRows),
    unmappedColumns: unmapped,
    missingColumns: [],
  }
}
