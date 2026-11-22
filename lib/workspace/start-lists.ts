import "server-only"
import { generateAdvancementStartList } from "@/lib/competition/advancement"
import { findClub } from "@/lib/competition/clubs"
import { entryRoundKey } from "@/lib/competition/rounds"
import type { LineStatus } from "@/lib/competition/results"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import type { CategoryId, Championship, Gender, RaceCode } from "@/lib/competition/rules/types"
import { generateStartList, type PreviousRanking, type StartList } from "@/lib/competition/start-list"
import { allRows } from "@/lib/supabase/all-rows"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { PREVIOUS_SEASON, type RoundStatus } from "./competition"

export interface RoundStartList {
  readonly round: {
    readonly id: string
    readonly race: RaceCode
    readonly roundKey: string
    readonly nameAr: string
    readonly status: RoundStatus
    readonly entryMode: "registration" | "advancement"
    readonly scheduledAt: string | null
    readonly needsReview: boolean
    readonly reviewReason: string | null
  }
  readonly event: { readonly id: string; readonly nameAr: string; readonly venueAr: string | null; readonly eventDate: string | null; readonly championship: Championship }
  /** Generated now from the current entries or approved results — what publishing would store. */
  readonly preview: StartList | null
  /** For a round fed by earlier rounds: the rounds whose results are not approved yet. */
  readonly waitingFor: readonly string[]
  readonly published: { readonly version: number; readonly list: StartList; readonly publishedAt: string } | null
}

/**
 * Builds the preview start list of a round:
 *  - a round clubs register for: from its entries and the athletes'
 *    previous-season National League rankings at this distance (Article 9 Table 9);
 *  - a round fed by earlier rounds: from the approved results of its
 *    prerequisite round (lib/competition/advancement.ts).
 * Federation staff only: rankings and unpublished results are not readable by clubs.
 */
export async function loadRoundStartList(roundId: string): Promise<RoundStartList | null> {
  const supabase = await createSupabaseServerClient()
  const { data: round, error } = await supabase
    .from("competition_rounds")
    .select(
      "id, event_id, catalogue_number, race_code, round_key, name_ar, status, entry_mode, scheduled_at, eligible_categories, needs_review, review_reason, event:events(id, name_ar, venue_ar, event_date, championship)"
    )
    .eq("id", roundId)
    .maybeSingle()
  if (error) throw new Error(`Could not load round: ${error.message}`)
  if (!round) return null
  const r = round as unknown as Record<string, unknown> & { event: Record<string, unknown> }

  const { data: published } = await supabase
    .from("start_lists")
    .select("version, payload, published_at")
    .eq("round_id", roundId)
    .is("superseded_at", null)
    .maybeSingle()

  let preview: StartList | null = null
  let waitingFor: string[] = []
  if (r.entry_mode === "advancement") {
    ;({ preview, waitingFor } = await advancementPreview(r))
  } else if (r.entry_mode === "registration") {
    const { data: entries, error: entriesError } = await supabase
      .from("race_entries")
      .select("athlete_id, category_id, athlete:athletes(federation_number, full_name_ar, gender), club:clubs(code)")
      .eq("round_id", roundId)
      .eq("status", "active")
    if (entriesError) throw new Error(`Could not load entries: ${entriesError.message}`)
    const rows = (entries ?? []) as unknown as {
      athlete_id: string
      category_id: CategoryId
      athlete: { federation_number: number; full_name_ar: string; gender: Gender }
      club: { code: string }
    }[]

    const rankings = new Map<string, PreviousRanking>()
    if (rows.length > 0 && r.round_key !== "race") {
      const { data: season } = await supabase.from("seasons").select("id").eq("code", PREVIOUS_SEASON).single()
      const { data: ranks, error: ranksError } = await supabase
        .from("previous_season_rankings")
        .select("athlete_id, rank, rank_raw, needs_review")
        .eq("season_id", season?.id)
        .eq("championship", "national_league")
        .eq("race_code", r.race_code as string)
        .in("athlete_id", rows.map((e) => e.athlete_id))
      if (ranksError) throw new Error(`Could not load rankings: ${ranksError.message}`)
      for (const k of ranks ?? []) {
        rankings.set(k.athlete_id as string, {
          rank: (k.rank as number | null) ?? null,
          rankRaw: (k.rank_raw as string | null) ?? null,
          needsReview: k.needs_review as boolean,
        })
      }
    }

    preview = generateStartList({
      championship: r.event.championship as Championship,
      race: r.race_code as RaceCode,
      roundKey: r.round_key as string,
      ruleset: SEASON_2026_2027,
      rankings,
      entrants: rows.map((e) => ({
        athleteId: e.athlete_id,
        federationNumber: e.athlete.federation_number,
        fullName: e.athlete.full_name_ar,
        clubCode: e.club.code,
        clubName: findClub(e.club.code)?.nameAr ?? e.club.code,
        categoryId: e.category_id,
        gender: e.athlete.gender,
      })),
    })
  }

  return {
    round: {
      id: r.id as string,
      race: r.race_code as RaceCode,
      roundKey: r.round_key as string,
      nameAr: r.name_ar as string,
      status: r.status as RoundStatus,
      entryMode: r.entry_mode as "registration" | "advancement",
      scheduledAt: (r.scheduled_at as string | null) ?? null,
      needsReview: r.needs_review as boolean,
      reviewReason: (r.review_reason as string | null) ?? null,
    },
    event: {
      id: r.event.id as string,
      nameAr: r.event.name_ar as string,
      venueAr: (r.event.venue_ar as string | null) ?? null,
      eventDate: (r.event.event_date as string | null) ?? null,
      championship: r.event.championship as Championship,
    },
    preview,
    waitingFor,
    published: published
      ? { version: published.version as number, list: published.payload as StartList, publishedAt: published.published_at as string }
      : null,
  }
}

async function advancementPreview(
  r: Record<string, unknown> & { event: Record<string, unknown> }
): Promise<{ preview: StartList | null; waitingFor: string[] }> {
  const supabase = await createSupabaseServerClient()
  const { data: prerequisites, error } = await supabase
    .from("round_prerequisites")
    .select("round:competition_rounds!round_prerequisites_prerequisite_round_id_fkey(id, round_key, name_ar, status, event:events(name_ar, championship))")
    .eq("round_id", r.id as string)
  if (error) throw new Error(`Could not load prerequisites: ${error.message}`)
  const rounds = ((prerequisites ?? []) as unknown as {
    round: { id: string; round_key: string; name_ar: string; status: RoundStatus; event: { name_ar: string; championship: Championship } }
  }[]).map((p) => p.round)

  const waitingFor = rounds.filter((p) => p.status !== "completed").map((p) => `${p.event.name_ar} — ${p.name_ar}`)
  const source = rounds[0]
  if (rounds.length !== 1 || !source || waitingFor.length > 0) return { preview: null, waitingFor }

  const [{ data: set }, { data: list }] = await Promise.all([
    supabase.from("result_sets").select("id").eq("round_id", source.id).in("status", ["approved", "published"]).maybeSingle(),
    supabase.from("start_lists").select("payload").eq("round_id", source.id).is("superseded_at", null).maybeSingle(),
  ])
  if (!set || !list) return { preview: null, waitingFor: [`${source.event.name_ar} — ${source.name_ar}`] }

  const lines = await allRows<{ athlete_id: string; status: LineStatus; time_cs: number | null; position: number | null }>((from, to) =>
    supabase
      .from("result_lines")
      .select("athlete_id, status, time_cs, position")
      .eq("result_set_id", set.id as string)
      .order("athlete_id")
      .range(from, to)
  )

  // Q12: the first round after the Qualifications, and its level B, take only registered athletes.
  const championship = r.event.championship as Championship
  const entryKey = entryRoundKey(championship, r.race_code as RaceCode, r.round_key as string)
  let registered: Set<string> | undefined
  if (entryKey) {
    let entryRoundId = r.id as string
    if (entryKey !== r.round_key) {
      const { data: sibling } = await supabase
        .from("competition_rounds")
        .select("id")
        .eq("event_id", r.event_id as string)
        .eq("catalogue_number", r.catalogue_number as number)
        .eq("round_key", entryKey)
        .maybeSingle()
      if (!sibling) return { preview: null, waitingFor }
      entryRoundId = sibling.id as string
    }
    const entries = await allRows<{ athlete_id: string }>((from, to) =>
      supabase.from("race_entries").select("athlete_id").eq("round_id", entryRoundId).eq("status", "active").order("athlete_id").range(from, to)
    )
    registered = new Set(entries.map((e) => e.athlete_id))
  }

  const preview = generateAdvancementStartList({
    championship,
    race: r.race_code as RaceCode,
    roundKey: r.round_key as string,
    eligibleCategories: (r.eligible_categories as CategoryId[] | null) ?? [],
    ruleset: SEASON_2026_2027,
    source: {
      roundId: source.id,
      resultSetId: set.id as string,
      championship: source.event.championship,
      roundKey: source.round_key,
      startList: list.payload as StartList,
      lines: new Map(lines.map((l) => [l.athlete_id, { status: l.status, timeCs: l.time_cs, position: l.position }])),
    },
    ...(registered ? { registered } : {}),
  })
  return { preview, waitingFor }
}
