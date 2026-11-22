"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireFederationAdmin } from "@/lib/auth/account"
import { previewAthleteImport } from "@/lib/competition/import/athletes"
import { previewRecordsImport } from "@/lib/competition/import/records"
import type { ImportPreview, SheetData } from "@/lib/competition/import/types"
import { readWorkbook, sha256 } from "@/lib/competition/import/workbook"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import { allRows } from "@/lib/supabase/all-rows"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { CURRENT_SEASON, PREVIOUS_SEASON } from "@/lib/workspace/competition"

export interface ImportState {
  readonly error?: string
}

const MAX_BYTES = 4 * 1024 * 1024
const SHEET_FOR = { athletes: "Database", historical_results: "Records" } as const

/**
 * Reads an uploaded workbook and stores a PREVIEW batch. Nothing reaches the
 * athlete registry or results here; that needs the separate commit step.
 */
export async function uploadImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: "الاستيراد يحتاج إلى ربط قاعدة البيانات، وهو غير متاح في وضع العرض." }

  const kind = formData.get("kind")
  const file = formData.get("file")
  if (kind !== "athletes" && kind !== "historical_results") return { error: "اختر نوع البيانات." }
  if (!(file instanceof File) || file.size === 0) return { error: "اختر ملف Excel." }
  if (file.size > MAX_BYTES) return { error: "الملف أكبر من 4 ميجابايت." }
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) return { error: "الملف يجب أن يكون بصيغة ‎.xlsx أو ‎.xlsm." }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileSha = sha256(bytes)

  let sheets: SheetData[]
  try {
    sheets = await readWorkbook(bytes)
  } catch {
    return { error: "تعذّرت قراءة الملف. تأكد أنه ملف Excel سليم وغير محمي بكلمة مرور." }
  }
  const sheet = sheets.find((s) => s.name.trim() === SHEET_FOR[kind]) ?? (sheets.length === 1 ? sheets[0] : undefined)
  if (!sheet) return { error: `لم يُعثر على ورقة «${SHEET_FOR[kind]}» في الملف.` }

  const supabase = await createSupabaseServerClient()
  let preview: ImportPreview<unknown>

  if (kind === "athletes") {
    let existing: Record<string, unknown>[]
    try {
      existing = await allRows((from, to) =>
        supabase.from("athletes").select("federation_number, full_name_ar, name_normalised, birth_year").order("id").range(from, to)
      )
    } catch (e) {
      return { error: e instanceof Error ? e.message : "تعذّر قراءة السجل." }
    }
    preview = previewAthleteImport(sheet, {
      ruleset: SEASON_2026_2027,
      rankingsSeason: PREVIOUS_SEASON,
      existing: existing.map((a) => ({
        federationNumber: a.federation_number as number,
        fullNameAr: a.full_name_ar as string,
        nameNormalised: a.name_normalised as string,
        birthYear: (a.birth_year as number | null) ?? null,
      })),
    })
  } else {
    let registry: Record<string, unknown>[]
    try {
      registry = await allRows((from, to) =>
        supabase.from("athletes").select("federation_number, full_name_ar").order("id").range(from, to)
      )
    } catch (e) {
      return { error: e instanceof Error ? e.message : "تعذّر قراءة السجل." }
    }
    if (registry.length === 0) return { error: "استورد سجل اللاعبين أولاً؛ النتائج تُربط بأرقام اللاعبين." }
    preview = previewRecordsImport(sheet, {
      registry: new Map(registry.map((a) => [a.federation_number as number, a.full_name_ar as string])),
    })
  }

  if (preview.missingColumns.length > 0) {
    return { error: `أعمدة مطلوبة غير موجودة في الورقة: ${preview.missingColumns.join("، ")}` }
  }
  if (preview.rows.length === 0) return { error: "الورقة لا تحتوي على صفوف بيانات." }

  const { data: batchId, error } = await supabase.rpc("create_import_batch", {
    kind,
    season_code: CURRENT_SEASON,
    file_name: file.name,
    file_sha256: fileSha,
    counts: { ...preview.counts, unmapped_columns: preview.unmappedColumns },
    rows: preview.rows,
  })
  if (error) return { error: error.message }

  revalidatePath("/dashboard/federation/import")
  redirect(`/dashboard/federation/import/${batchId as string}`)
}

export interface DecisionState {
  readonly ok?: string
  readonly error?: string
}

export async function decideImport(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  await requireFederationAdmin()
  const batch = String(formData.get("batch") ?? "")
  const decision = formData.get("decision")
  if (!batch || (decision !== "commit" && decision !== "discard")) return { error: "طلب غير صالح." }

  const supabase = await createSupabaseServerClient()
  if (decision === "commit") {
    const { error } = await supabase.rpc("commit_import_batch", { batch })
    if (error) return { error: `لم يُستورد أي شيء: ${error.message}` }
  } else {
    const { error } = await supabase.rpc("discard_import_batch", { batch })
    if (error) return { error: error.message }
  }
  revalidatePath("/dashboard", "layout")
  return { ok: decision === "commit" ? "تم الاستيراد." : "تم تجاهل الملف." }
}
