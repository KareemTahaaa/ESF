"use server"

import { revalidatePath } from "next/cache"
import { requireClubAdmin } from "@/lib/auth/account"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface EntryState {
  readonly ok?: string
  readonly error?: string
}

const UUID = /^[0-9a-f-]{36}$/

/**
 * Submits the selected athletes for one race.
 *
 * The page only offers eligible athletes, but that is a convenience: the
 * database function re-checks club membership, category, deadline, race status
 * and duplicates for every athlete, and enters all of them or none.
 */
export async function submitEntries(_prev: EntryState, formData: FormData): Promise<EntryState> {
  const account = await requireClubAdmin()
  if (account.isDemo) return { error: "وضع العرض: لم يُحفظ التسجيل." }
  const round = String(formData.get("round") ?? "")
  const athletes = formData.getAll("athlete").map(String).filter((a) => UUID.test(a))
  if (!UUID.test(round)) return { error: "طلب غير صالح." }
  if (athletes.length === 0) return { error: "اختر لاعباً واحداً على الأقل." }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("submit_race_entries", { round, athlete_ids: athletes })
  if (error) return { error: `لم يُسجَّل أحد: ${error.message}` }
  revalidatePath("/dashboard/club", "layout")
  return { ok: `تم تسجيل ${data as number} لاعب.` }
}

export async function withdrawEntry(_prev: EntryState, formData: FormData): Promise<EntryState> {
  const account = await requireClubAdmin()
  if (account.isDemo) return { error: "وضع العرض: لم يُحفظ." }
  const entry = String(formData.get("entry") ?? "")
  if (!UUID.test(entry)) return { error: "طلب غير صالح." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("withdraw_race_entry", { entry })
  if (error) return { error: error.message }
  revalidatePath("/dashboard/club", "layout")
  return { ok: "تم سحب التسجيل." }
}
