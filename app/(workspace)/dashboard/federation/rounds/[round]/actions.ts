"use server"

import { revalidatePath } from "next/cache"
import { requireFederationAdmin } from "@/lib/auth/account"
import { clubAdminEmails, clubsInRound, notify, roundContext } from "@/lib/notify/send"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { loadRoundStartList } from "@/lib/workspace/start-lists"

export interface PublishState {
  readonly ok?: string
  readonly error?: string
}

/**
 * Publishes the start list. It is regenerated here on the server from the
 * current entries — never taken from the browser — and the database checks it
 * again against the entries before storing it.
 */
export async function publishStartList(_prev: PublishState, formData: FormData): Promise<PublishState> {
  const admin = await requireFederationAdmin()
  if (admin.isDemo) return { error: "غير متاح في وضع العرض." }
  const round = String(formData.get("round") ?? "")
  if (!/^[0-9a-f-]{36}$/.test(round)) return { error: "طلب غير صالح." }

  const loaded = await loadRoundStartList(round)
  if (!loaded?.preview) return { error: "لا توجد قائمة لهذا الدور." }
  if (!loaded.preview.official) {
    return { error: `لا يمكن نشر القائمة رسمياً: ${loaded.preview.blockers.map((b) => b.openQuestion).join("، ")}` }
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("publish_start_list", { round, payload: loaded.preview })
  if (error) return { error: error.message }
  await notify(async () => {
    const ctx = await roundContext(round)
    return {
      to: await clubAdminEmails(await clubsInRound(round)),
      notification: { kind: "start_list_published", roundLabel: ctx.label, version: data as number, scheduledAt: ctx.scheduledAt },
    }
  })
  revalidatePath("/dashboard", "layout")
  return { ok: `نُشرت قائمة البدء (النسخة ${data as number}).` }
}
