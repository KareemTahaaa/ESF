import "server-only"
import type { StartList } from "@/lib/competition/start-list"
import type { Championship, RaceCode } from "@/lib/competition/rules/types"
import type { LineStatus } from "@/lib/competition/results"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { RoundStatus } from "./competition"

export type ResultSetStatus = "draft" | "submitted" | "approved" | "published" | "superseded"

export interface RoundResults {
  readonly round: {
    readonly id: string
    readonly nameAr: string
    readonly race: RaceCode
    readonly roundKey: string
    readonly status: RoundStatus
    readonly needsReview: boolean
    readonly reviewReason: string | null
  }
  readonly event: { readonly id: string; readonly nameAr: string; readonly championship: Championship }
  readonly startList: { readonly version: number; readonly list: StartList } | null
  readonly resultSet: {
    readonly id: string
    readonly version: number
    readonly status: ResultSetStatus
    readonly correctionReason: string | null
    readonly submittedAt: string | null
    readonly approvedAt: string | null
    readonly publishedAt: string | null
  } | null
  readonly lines: ReadonlyMap<string, { status: LineStatus; timeCs: number | null; position: number | null; note: string | null }>
  readonly history: readonly { readonly version: number; readonly status: ResultSetStatus; readonly correctionReason: string | null }[]
}

export async function loadRoundResults(roundId: string): Promise<RoundResults | null> {
  const supabase = await createSupabaseServerClient()
  const { data: round, error } = await supabase
    .from("competition_rounds")
    .select("id, name_ar, race_code, round_key, status, needs_review, review_reason, event:events(id, name_ar, championship)")
    .eq("id", roundId)
    .maybeSingle()
  if (error) throw new Error(`Could not load round: ${error.message}`)
  if (!round) return null
  const r = round as unknown as Record<string, unknown> & { event: Record<string, unknown> }

  const [{ data: list }, { data: sets }] = await Promise.all([
    supabase.from("start_lists").select("version, payload").eq("round_id", roundId).is("superseded_at", null).maybeSingle(),
    supabase
      .from("result_sets")
      .select("id, version, status, correction_reason, submitted_at, approved_at, published_at")
      .eq("round_id", roundId)
      .order("version", { ascending: false }),
  ])
  const live = (sets ?? []).find((s) => s.status !== "superseded")

  const lines = new Map<string, { status: LineStatus; timeCs: number | null; position: number | null; note: string | null }>()
  if (live) {
    const { data } = await supabase.from("result_lines").select("athlete_id, status, time_cs, position, note").eq("result_set_id", live.id)
    for (const l of data ?? []) {
      lines.set(l.athlete_id as string, {
        status: l.status as LineStatus,
        timeCs: (l.time_cs as number | null) ?? null,
        position: (l.position as number | null) ?? null,
        note: (l.note as string | null) ?? null,
      })
    }
  }

  return {
    round: {
      id: r.id as string,
      nameAr: r.name_ar as string,
      race: r.race_code as RaceCode,
      roundKey: r.round_key as string,
      status: r.status as RoundStatus,
      needsReview: r.needs_review as boolean,
      reviewReason: (r.review_reason as string | null) ?? null,
    },
    event: { id: r.event.id as string, nameAr: r.event.name_ar as string, championship: r.event.championship as Championship },
    startList: list ? { version: list.version as number, list: list.payload as StartList } : null,
    resultSet: live
      ? {
          id: live.id as string,
          version: live.version as number,
          status: live.status as ResultSetStatus,
          correctionReason: (live.correction_reason as string | null) ?? null,
          submittedAt: (live.submitted_at as string | null) ?? null,
          approvedAt: (live.approved_at as string | null) ?? null,
          publishedAt: (live.published_at as string | null) ?? null,
        }
      : null,
    lines,
    history: (sets ?? []).map((s) => ({
      version: s.version as number,
      status: s.status as ResultSetStatus,
      correctionReason: (s.correction_reason as string | null) ?? null,
    })),
  }
}

/** Rounds whose results are waiting for a federation admin's approval. */
export async function listResultsAwaitingApproval(): Promise<readonly { roundId: string; label: string }[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("result_sets")
    .select("round:competition_rounds(id, name_ar, race_code, event:events(name_ar))")
    .eq("status", "submitted")
  return ((data ?? []) as unknown as { round: { id: string; name_ar: string; race_code: string; event: { name_ar: string } | null } | null }[])
    .filter((r) => r.round)
    .map((r) => ({ roundId: r.round!.id, label: `${r.round!.event?.name_ar ?? ""} — ${r.round!.name_ar} (${r.round!.race_code})` }))
}
