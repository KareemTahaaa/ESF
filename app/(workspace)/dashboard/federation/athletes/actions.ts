"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireFederationAdmin } from "@/lib/auth/account"
import { normaliseArabic } from "@/lib/competition/arabic"
import { CLUBS } from "@/lib/competition/clubs"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface AthleteActionState {
  readonly ok?: string
  readonly error?: string
}

const DEMO = "غير متاح في وضع العرض."
const UUID = /^[0-9a-f-]{36}$/
const clubCodes = CLUBS.map((c) => c.code) as [string, ...string[]]

const recordSchema = z.object({
  fullName: z.string().trim().min(3, "اكتب الاسم الكامل."),
  birthYear: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, "سنة الميلاد أربعة أرقام.")
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (v >= 1920 && v <= 2030), "سنة الميلاد غير صالحة."),
  gender: z.enum(["M", "F"], { errorMap: () => ({ message: "اختر النوع." }) }),
  registrationNumber: z.string().trim().optional(),
  reason: z.string().trim().min(3, "اكتب سبب التعديل؛ يُحفظ في سجل التدقيق."),
})

function toValues(d: z.infer<typeof recordSchema>) {
  return {
    full_name_ar: d.fullName,
    name_normalised: normaliseArabic(d.fullName),
    birth_year: d.birthYear,
    gender: d.gender,
    registration_number: d.registrationNumber || null,
  }
}

export async function updateAthlete(_prev: AthleteActionState, formData: FormData): Promise<AthleteActionState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: DEMO }
  const id = String(formData.get("athlete") ?? "")
  if (!UUID.test(id)) return { error: "طلب غير صالح." }
  const parsed = recordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("federation_update_athlete", { athlete: id, v: toValues(parsed.data), reason: parsed.data.reason })
  if (error) return { error: error.message }
  revalidatePath("/dashboard", "layout")
  return { ok: "حُفظ التعديل وسُجّل في السجل." }
}

const addSchema = recordSchema.extend({
  federationNumber: z.coerce.number().int().positive("رقم الاتحاد غير صالح."),
  club: z.enum(clubCodes, { errorMap: () => ({ message: "اختر النادي." }) }),
  allowSimilar: z.literal("yes").optional(),
})

export async function addAthlete(_prev: AthleteActionState, formData: FormData): Promise<AthleteActionState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: DEMO }
  const parsed = addSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("federation_add_athlete", {
    v: { ...toValues(parsed.data), federation_number: parsed.data.federationNumber, allow_similar: parsed.data.allowSimilar === "yes" },
    club_code: parsed.data.club,
    reason: parsed.data.reason,
  })
  if (error) return { error: error.message }
  revalidatePath("/dashboard", "layout")
  redirect(`/dashboard/federation/athletes/${data as string}`)
}

export async function transferAthlete(_prev: AthleteActionState, formData: FormData): Promise<AthleteActionState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: DEMO }
  const id = String(formData.get("athlete") ?? "")
  const club = String(formData.get("club") ?? "")
  const reason = String(formData.get("reason") ?? "").trim()
  if (!UUID.test(id) || !clubCodes.includes(club)) return { error: "اختر النادي الجديد." }
  if (reason.length < 3) return { error: "اكتب سبب الانتقال." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("federation_transfer_athlete", { athlete: id, club_code: club, reason })
  if (error) return { error: error.message }
  revalidatePath("/dashboard", "layout")
  return { ok: "سُجّل الانتقال. تبقى نتائج اللاعب السابقة باسم ناديه وقتها." }
}

export async function setAthleteActive(_prev: AthleteActionState, formData: FormData): Promise<AthleteActionState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: DEMO }
  const id = String(formData.get("athlete") ?? "")
  const active = formData.get("active") === "true"
  const reason = String(formData.get("reason") ?? "").trim()
  if (!UUID.test(id)) return { error: "طلب غير صالح." }
  if (reason.length < 3) return { error: "اكتب السبب." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("federation_set_athlete_active", { athlete: id, active, reason })
  if (error) return { error: error.message }
  revalidatePath("/dashboard", "layout")
  return { ok: active ? "أُعيد تفعيل اللاعب." : "أُوقف اللاعب؛ لن يظهر للتسجيل في السباقات." }
}
