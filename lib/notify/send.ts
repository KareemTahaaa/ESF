import "server-only"
import { after } from "next/server"
import { headers } from "next/headers"
import { Resend } from "resend"
import { raceLabel } from "@/lib/competition/rounds"
import type { RaceCode } from "@/lib/competition/rules/types"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { renderNotification, type Notification } from "./templates"

/**
 * Sends notification emails through Resend, the service the website's contact
 * form already uses (RESEND_API_KEY).
 *
 * A notification never decides whether an action succeeds: recipients are
 * looked up after the change is saved, the email goes out after the response
 * (`after`), and any failure is only logged. Without RESEND_API_KEY nothing is
 * sent and the platform works as before.
 *
 * Recipients are looked up as the signed-in user, so Row Level Security
 * applies here too.
 */

/** The sender. Must be on a domain verified in Resend; onboarding@resend.dev can only reach the Resend account's own address. */
const FROM = process.env.NOTIFY_FROM_EMAIL || "الاتحاد المصري للتزلج <onboarding@resend.dev>"

/** Where federation notifications go (new accounts, club requests, results to approve). */
export const FEDERATION_INBOX = process.env.FEDERATION_NOTIFY_EMAIL || "secretariat@egyptskate.org"

export interface Delivery {
  readonly to: readonly string[]
  readonly notification: Notification
}

async function siteUrl(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "http://localhost:3000"
}

/**
 * Resolves who to tell (quick lookups, while the request is still open) and
 * sends after the response. Never throws.
 */
export async function notify(resolve: () => Promise<Delivery | null>): Promise<void> {
  try {
    const delivery = await resolve()
    if (!delivery) return
    const to = [...new Set(delivery.to.map((e) => e.trim().toLowerCase()).filter(Boolean))]
    if (to.length === 0) return
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.info(`[notify] RESEND_API_KEY not set; skipped "${delivery.notification.kind}" to ${to.length} recipient(s).`)
      return
    }
    const message = renderNotification(delivery.notification, await siteUrl())
    after(async () => {
      try {
        // One email per recipient, so clubs never see each other's addresses.
        const resend = new Resend(apiKey)
        for (let i = 0; i < to.length; i += 100) {
          const { error } = await resend.batch.send(
            to.slice(i, i + 100).map((address) => ({ from: FROM, to: [address], subject: message.subject, html: message.html, text: message.text }))
          )
          if (error) console.error(`[notify] "${delivery.notification.kind}" failed:`, error.message)
        }
      } catch (e) {
        console.error(`[notify] "${delivery.notification.kind}" failed:`, e instanceof Error ? e.message : e)
      }
    })
  } catch (e) {
    console.error("[notify] could not prepare notification:", e instanceof Error ? e.message : e)
  }
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** Approved club admins' emails, for the given clubs (by id) or for every club. */
export async function clubAdminEmails(clubIds?: readonly string[]): Promise<string[]> {
  if (clubIds && clubIds.length === 0) return []
  const supabase = await createSupabaseServerClient()
  let query = supabase.from("profiles").select("email").eq("role", "club_admin").eq("status", "approved").not("club_id", "is", null)
  if (clubIds) query = query.in("club_id", clubIds)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.email as string)
}

export interface RoundContext {
  readonly label: string
  readonly deadline: string | null
  readonly scheduledAt: string | null
}

export async function roundContext(round: string): Promise<RoundContext> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("competition_rounds")
    .select("name_ar, race_code, registration_deadline, scheduled_at, event:events(name_ar)")
    .eq("id", round)
    .single()
  if (error || !data) throw new Error(error?.message ?? "round not found")
  const r = data as unknown as {
    name_ar: string
    race_code: RaceCode
    registration_deadline: string | null
    scheduled_at: string | null
    event: { name_ar: string } | null
  }
  return {
    label: `${r.name_ar} ${raceLabel(r.race_code)}${r.event ? ` — ${r.event.name_ar}` : ""}`,
    deadline: r.registration_deadline,
    scheduledAt: r.scheduled_at,
  }
}

/** Clubs with an athlete in the round: on its current start list, or entered. */
export async function clubsInRound(round: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient()
  const [lanes, entries] = await Promise.all([
    supabase.from("start_list_lanes").select("club_code, start_list:start_lists!inner(round_id, superseded_at)").eq("start_list.round_id", round).is("start_list.superseded_at", null),
    supabase.from("race_entries").select("club_id").eq("round_id", round).eq("status", "active"),
  ])
  if (lanes.error) throw new Error(lanes.error.message)
  if (entries.error) throw new Error(entries.error.message)
  const codes = [...new Set((lanes.data ?? []).map((l) => l.club_code as string))]
  const ids = new Set((entries.data ?? []).map((e) => e.club_id as string))
  if (codes.length > 0) {
    const { data, error } = await supabase.from("clubs").select("id").in("code", codes)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) ids.add(c.id as string)
  }
  return [...ids]
}
