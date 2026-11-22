"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireFederationAdmin } from "@/lib/auth/account"
import { planRounds } from "@/lib/competition/rounds"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import { clubAdminEmails, clubsInRound, notify, roundContext } from "@/lib/notify/send"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { CURRENT_SEASON } from "@/lib/workspace/competition"
import { cairoLocalToIso } from "@/lib/workspace/time"

export interface ActionState {
  readonly ok?: string
  readonly error?: string
}

const DEMO = "غير متاح في وضع العرض: يحتاج إلى ربط قاعدة البيانات."

const eventSchema = z.object({
  championship: z.enum(["qualifications", "national_league", "egypt_cup"], {
    errorMap: () => ({ message: "اختر البطولة." }),
  }),
  name: z.string().trim().min(3, "اكتب اسم الفعالية."),
  venue: z.string().trim().optional(),
  date: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "تاريخ غير صالح.")
    .optional(),
})

export async function createEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: DEMO }
  const parsed = eventSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("create_event", {
    season_code: CURRENT_SEASON,
    championship: parsed.data.championship,
    name_ar: parsed.data.name,
    venue_ar: parsed.data.venue || null,
    event_date: parsed.data.date || null,
  })
  if (error) return { error: error.message }
  revalidatePath("/dashboard/federation/events")
  redirect(`/dashboard/federation/events/${data as string}`)
}

/**
 * Adds a catalogue row to an event. The rules engine decides which rounds the
 * row holds, who may enter and what each round depends on; the database
 * resolves the prerequisites and creates every round in one transaction.
 */
export async function addCatalogueRow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: DEMO }
  const event = String(formData.get("event") ?? "")
  const number = Number(formData.get("number"))
  if (!event || !Number.isInteger(number)) return { error: "طلب غير صالح." }

  let rounds
  try {
    // Long distances: عمومي, شباب and ناشئين, the last two merged (Q11, answered 2026-11-03).
    rounds = planRounds(number, SEASON_2026_2027)
  } catch (e) {
    return { error: e instanceof Error ? e.message : "سباق غير معروف." }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("add_catalogue_rounds", {
    event,
    rounds: rounds.map((r) => ({
      catalogue_number: r.catalogueNumber,
      championship: r.championship,
      race_code: r.race,
      round_key: r.roundKey,
      name_ar: r.nameAr,
      entry_mode: r.entryMode,
      eligible_categories: r.eligibleCategories,
      ruleset_version: SEASON_2026_2027.version,
      prerequisites: r.prerequisites.map((p) => ({ championship: p.championship, race_code: p.race, round_key: p.roundKey })),
    })),
  })
  if (error) return { error: error.message }
  revalidatePath(`/dashboard/federation/events/${event}`)
  return { ok: `أُضيف السباق ${number}.` }
}

export async function scheduleRound(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: DEMO }
  const round = String(formData.get("round") ?? "")
  const deadline = cairoLocalToIso(String(formData.get("deadline") ?? ""))
  const scheduledRaw = String(formData.get("scheduled") ?? "")
  const scheduled = scheduledRaw ? cairoLocalToIso(scheduledRaw) : null
  if (!round) return { error: "طلب غير صالح." }
  if (!deadline) return { error: "حدّد آخر موعد للتسجيل (بتوقيت القاهرة)." }
  if (scheduledRaw && !scheduled) return { error: "موعد السباق غير صالح." }
  if (scheduled && scheduled < deadline) return { error: "موعد السباق يجب أن يكون بعد آخر موعد للتسجيل." }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("set_round_schedule", {
    round,
    registration_deadline: deadline,
    scheduled_at: scheduled,
  })
  if (error) return { error: error.message }
  revalidatePath("/dashboard", "layout")
  return { ok: "حُفظ الموعد." }
}

const STATUSES = [
  "registration_open",
  "registration_closed",
  "start_list_published",
  "results_submitted",
  "completed",
  "cancelled",
] as const

export async function changeRoundStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: DEMO }
  const round = String(formData.get("round") ?? "")
  const status = String(formData.get("status") ?? "")
  const reason = String(formData.get("reason") ?? "").trim()
  if (!round || !(STATUSES as readonly string[]).includes(status)) return { error: "طلب غير صالح." }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("set_round_status", { round, new_status: status, reason: reason || null })
  if (error) return { error: error.message }
  if (status === "registration_open") {
    await notify(async () => {
      const ctx = await roundContext(round)
      return { to: await clubAdminEmails(), notification: { kind: "registration_opened", roundLabel: ctx.label, deadline: ctx.deadline } }
    })
  } else if (status === "cancelled") {
    await notify(async () => {
      const ctx = await roundContext(round)
      return {
        to: await clubAdminEmails(await clubsInRound(round)),
        notification: { kind: "round_cancelled", roundLabel: ctx.label, reason: reason || null },
      }
    })
  }
  revalidatePath("/dashboard", "layout")
  return { ok: "تم." }
}

export async function enterAthleteException(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: DEMO }
  const round = String(formData.get("round") ?? "")
  const federationNumber = Number(formData.get("federationNumber"))
  const reason = String(formData.get("reason") ?? "").trim()
  if (!round || !Number.isInteger(federationNumber) || federationNumber <= 0) return { error: "اكتب رقم اللاعب." }
  if (reason.length < 5) return { error: "اكتب سبب الإضافة الاستثنائية؛ يُحفظ في سجل التدقيق." }

  const supabase = await createSupabaseServerClient()
  const { data: athlete } = await supabase.from("athletes").select("id").eq("federation_number", federationNumber).maybeSingle()
  if (!athlete) return { error: `لا يوجد لاعب برقم ${federationNumber}.` }
  const { error } = await supabase.rpc("federation_enter_athlete", { round, athlete: athlete.id, reason })
  if (error) return { error: error.message }
  revalidatePath("/dashboard", "layout")
  return { ok: "أُضيف اللاعب وسُجّل السبب." }
}

/**
 * Deletes an event set up by mistake. The database allows it only while the
 * event has no entries, start lists or results and nothing depends on it, and
 * keeps what was deleted, with the reason, in the audit log.
 */
export async function deleteEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: DEMO }
  const event = String(formData.get("event") ?? "")
  const reason = String(formData.get("reason") ?? "").trim()
  if (!/^[0-9a-f-]{36}$/.test(event)) return { error: "طلب غير صالح." }
  if (reason.length < 3) return { error: "اكتب سبب الحذف؛ يُحفظ في سجل التدقيق." }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("delete_event", { event, reason })
  if (error) {
    const m = error.message
    if (/entered athletes/.test(m)) return { error: "سجّلت الأندية لاعبين في هذه الفعالية، فلا يمكن حذفها. ألغِ سباقاتها بدلاً من ذلك." }
    if (/start list/.test(m)) return { error: "نُشرت قائمة بدء في هذه الفعالية، فلا يمكن حذفها. ألغِ سباقاتها بدلاً من ذلك." }
    if (/Results have been entered/.test(m)) return { error: "أُدخلت نتائج في هذه الفعالية، فلا يمكن حذفها. ألغِ سباقاتها بدلاً من ذلك." }
    if (/another event/.test(m)) return { error: "سباقات في فعالية أخرى تأخذ لاعبيها من هذه الفعالية. احذف تلك أو ألغِها أولاً." }
    return { error: m }
  }
  revalidatePath("/dashboard", "layout")
  redirect("/dashboard/federation/events")
}
