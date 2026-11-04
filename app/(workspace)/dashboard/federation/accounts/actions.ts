"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireFederationAdmin } from "@/lib/auth/account"
import { CLUBS } from "@/lib/competition/clubs"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { notify } from "@/lib/notify/send"

export interface ReviewState {
  readonly ok?: string
  readonly error?: string
}

const reviewSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("approve"),
    profileId: z.string().min(1),
    clubCode: z.enum(CLUBS.map((c) => c.code) as [string, ...string[]], {
      errorMap: () => ({ message: "اختر النادي قبل الموافقة." }),
    }),
  }),
  z.object({
    decision: z.literal("reject"),
    profileId: z.string().min(1),
    reason: z.string().trim().min(5, "اكتب سبب الرفض ليظهر لصاحب الطلب."),
  }),
  z.object({
    decision: z.literal("suspend"),
    profileId: z.string().min(1),
  }),
])

/**
 * Approves, rejects or suspends a club account.
 *
 * The role check here is the first gate; review_club_account() repeats it in
 * the database and writes the audit entry in the same transaction, so the
 * decision and its record can never diverge.
 */
export async function reviewClubAccount(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const admin = await requireFederationAdmin()

  const parsed = reviewSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير مكتملة." }

  if (admin.isDemo) {
    return { ok: "وضع العرض: لم يُحفظ القرار. سيُحفظ ويُسجّل في سجل التدقيق بعد ربط قاعدة البيانات." }
  }

  const supabase = await createSupabaseServerClient()
  let confirmedClub: string | null = null

  if (parsed.data.decision === "approve") {
    const { data: club, error } = await supabase.from("clubs").select("id").eq("code", parsed.data.clubCode).single()
    if (error || !club) return { error: "النادي المختار غير موجود في قاعدة البيانات." }
    confirmedClub = club.id as string
  }

  const { error } = await supabase.rpc("review_club_account", {
    target_profile: parsed.data.profileId,
    decision: parsed.data.decision,
    confirmed_club: confirmedClub,
    reason: parsed.data.decision === "reject" ? parsed.data.reason : null,
  })

  if (error) return { error: error.message }

  const decided = parsed.data
  await notify(async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name, club:clubs!profiles_club_id_fkey(name_ar)")
      .eq("id", decided.profileId)
      .single()
    if (!profile) return null
    const p = profile as unknown as { email: string; full_name: string; club: { name_ar: string } | null }
    return {
      to: [p.email],
      notification:
        decided.decision === "approve"
          ? { kind: "account_approved", fullName: p.full_name, clubName: p.club?.name_ar ?? "" }
          : decided.decision === "reject"
            ? { kind: "account_rejected", fullName: p.full_name, reason: decided.reason }
            : { kind: "account_suspended", fullName: p.full_name },
    }
  })

  revalidatePath("/dashboard/federation", "layout")
  return {
    ok: { approve: "تمت الموافقة وربط الحساب بالنادي.", reject: "تم رفض الطلب.", suspend: "تم إيقاف الحساب. لم يعد بإمكان صاحبه رؤية بيانات النادي." }[
      parsed.data.decision
    ],
  }
}
