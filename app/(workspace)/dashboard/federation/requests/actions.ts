"use server"

import { revalidatePath } from "next/cache"
import { requireFederationAdmin } from "@/lib/auth/account"
import { normaliseArabic } from "@/lib/competition/arabic"
import { clubAdminEmails, notify } from "@/lib/notify/send"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface ReviewState {
  readonly ok?: string
  readonly error?: string
}

/**
 * Approves or rejects a club's athlete request. The reviewer may adjust the
 * proposed values before approving; the database applies them, with the same
 * checks as a federation edit, and links the request to the result.
 */
export async function reviewAthleteRequest(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: "غير متاح في وضع العرض." }
  const request = String(formData.get("request") ?? "")
  const decision = formData.get("decision")
  const kind = formData.get("kind")
  const note = String(formData.get("note") ?? "").trim()
  if (!/^[0-9a-f-]{36}$/.test(request) || (decision !== "approve" && decision !== "reject")) return { error: "طلب غير صالح." }
  if (decision === "reject" && note.length < 3) return { error: "اكتب للنادي سبب الرفض." }

  let final: Record<string, unknown> | null = null
  if (decision === "approve") {
    final = {}
    const fullName = String(formData.get("fullName") ?? "").trim()
    const birthYear = String(formData.get("birthYear") ?? "").trim()
    const gender = String(formData.get("gender") ?? "")
    const registrationNumber = formData.get("registrationNumber")
    if (fullName) Object.assign(final, { full_name_ar: fullName, name_normalised: normaliseArabic(fullName) })
    if (birthYear) {
      if (!/^\d{4}$/.test(birthYear)) return { error: "سنة الميلاد غير صالحة." }
      final.birth_year = Number(birthYear)
    }
    if (gender === "M" || gender === "F") final.gender = gender
    if (typeof registrationNumber === "string" && registrationNumber.trim()) final.registration_number = registrationNumber.trim()
    if (kind === "new_athlete") {
      const number = Number(formData.get("federationNumber"))
      if (!Number.isInteger(number) || number <= 0) return { error: "حدد رقم الاتحاد للاعب الجديد." }
      final.federation_number = number
      final.allow_similar = formData.get("allowSimilar") === "yes"
      if (!fullName || !final.gender) return { error: "الاسم والنوع مطلوبان للاعب الجديد." }
    }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("review_athlete_request", { request, decision, final, review_note: note || null })
  if (error) return { error: error.message }
  await notify(async () => {
    const { data } = await supabase
      .from("athlete_requests")
      .select("club_id, kind, proposed, athlete:athletes!athlete_requests_athlete_id_fkey(full_name_ar)")
      .eq("id", request)
      .single()
    if (!data) return null
    const r = data as unknown as {
      club_id: string
      kind: "new_athlete" | "correction"
      proposed: { full_name_ar?: string }
      athlete: { full_name_ar: string } | null
    }
    return {
      to: await clubAdminEmails([r.club_id]),
      notification: {
        kind: "athlete_request_decided",
        approved: decision === "approve",
        requestKind: r.kind,
        athleteName: r.athlete?.full_name_ar ?? r.proposed.full_name_ar ?? null,
        note: note || null,
      },
    }
  })
  revalidatePath("/dashboard", "layout")
  return { ok: decision === "approve" ? "تمت الموافقة وطُبّق التغيير." : "رُفض الطلب، وسيرى النادي السبب." }
}
