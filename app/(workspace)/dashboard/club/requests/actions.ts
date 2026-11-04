"use server"

import { revalidatePath } from "next/cache"
import { requireClubAdmin } from "@/lib/auth/account"
import { FEDERATION_INBOX, notify } from "@/lib/notify/send"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface RequestState {
  readonly ok?: string
  readonly error?: string
}

/**
 * Sends a proposed new athlete or correction to the federation. Only changed
 * fields are sent for a correction; the database checks the athlete belongs to
 * this club and that every value is valid. Nothing in the registry changes
 * until the federation approves.
 */
export async function submitAthleteRequest(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const account = await requireClubAdmin()
  if (account.isDemo) return { error: "وضع العرض: لم يُرسل الطلب." }
  const kind = formData.get("kind")
  if (kind !== "new_athlete" && kind !== "correction") return { error: "طلب غير صالح." }
  const athlete = kind === "correction" ? String(formData.get("athlete") ?? "") : null
  if (kind === "correction" && !/^[0-9a-f-]{36}$/.test(athlete ?? "")) return { error: "اختر اللاعب." }

  const proposed: Record<string, unknown> = {}
  const fullName = String(formData.get("fullName") ?? "").trim()
  const birthYear = String(formData.get("birthYear") ?? "").trim()
  const gender = String(formData.get("gender") ?? "")
  const registrationNumber = String(formData.get("registrationNumber") ?? "").trim()
  if (fullName) proposed.full_name_ar = fullName
  if (birthYear) {
    if (!/^\d{4}$/.test(birthYear)) return { error: "سنة الميلاد أربعة أرقام." }
    proposed.birth_year = Number(birthYear)
  }
  if (gender === "M" || gender === "F") proposed.gender = gender
  if (registrationNumber) proposed.registration_number = registrationNumber
  if (Object.keys(proposed).length === 0) return { error: "اكتب ما يجب تغييره." }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("submit_athlete_request", {
    kind,
    athlete,
    proposed,
    note: String(formData.get("note") ?? "").trim() || null,
  })
  if (error) return { error: error.message }
  await notify(async () => {
    let athleteName = fullName || null
    if (!athleteName && athlete) {
      const { data } = await supabase.from("athletes").select("full_name_ar").eq("id", athlete).single()
      athleteName = (data?.full_name_ar as string | undefined) ?? null
    }
    return {
      to: [FEDERATION_INBOX],
      notification: { kind: "athlete_request_submitted", clubName: account.club.nameAr, requestKind: kind, athleteName },
    }
  })
  revalidatePath("/dashboard/club", "layout")
  return { ok: "أُرسل الطلب إلى الاتحاد. سيظهر هنا قراره." }
}

export async function withdrawAthleteRequest(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const account = await requireClubAdmin()
  if (account.isDemo) return { error: "وضع العرض." }
  const request = String(formData.get("request") ?? "")
  if (!/^[0-9a-f-]{36}$/.test(request)) return { error: "طلب غير صالح." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("withdraw_athlete_request", { request })
  if (error) return { error: error.message }
  revalidatePath("/dashboard/club", "layout")
  return { ok: "سُحب الطلب." }
}
