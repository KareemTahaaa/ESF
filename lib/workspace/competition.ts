import "server-only"
import { findClub, type Club } from "@/lib/competition/clubs"
import { takesQualifiedEntries } from "@/lib/competition/rounds"
import type { Championship, RaceCode } from "@/lib/competition/rules/types"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { allRows } from "@/lib/supabase/all-rows"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Competition data for the workspace, read as the signed-in user.
 *
 * Every query here runs through Row Level Security: a club admin's session can
 * only ever return that club's athletes and entries, whatever this code asks
 * for. Pages still check the role first (lib/auth/account.ts) so the right
 * screen is shown; the database is what keeps the data apart.
 */

export const CURRENT_SEASON = "2026-2027"
export const PREVIOUS_SEASON = "2025-2026"

export type RoundStatus =
  | "draft"
  | "registration_open"
  | "registration_closed"
  | "start_list_published"
  | "results_submitted"
  | "completed"
  | "cancelled"

export const ROUND_STATUS_LABEL: Record<RoundStatus, string> = {
  draft: "مسودة",
  registration_open: "التسجيل مفتوح",
  registration_closed: "التسجيل مغلق",
  start_list_published: "قائمة البدء منشورة",
  results_submitted: "النتائج بانتظار الاعتماد",
  completed: "مكتمل — نتائج معتمدة",
  cancelled: "ملغى",
}

export const ROUND_STATUS_TONE: Record<RoundStatus, "ok" | "wait" | "stop" | "neutral"> = {
  draft: "neutral",
  registration_open: "ok",
  registration_closed: "wait",
  start_list_published: "wait",
  results_submitted: "wait",
  completed: "ok",
  cancelled: "stop",
}

export const CHAMPIONSHIP_LABEL: Record<Championship, string> = {
  qualifications: "جولة التصفيات",
  national_league: "الدوري العام",
  egypt_cup: "كأس مصر",
}

async function db() {
  return createSupabaseServerClient()
}

function fail(what: string, message: string): never {
  throw new Error(`Could not load ${what}: ${message}`)
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

export interface ImportBatchSummary {
  readonly id: string
  readonly kind: "athletes" | "historical_results"
  readonly fileName: string
  readonly sha256: string
  readonly status: "preview" | "committed" | "discarded"
  readonly counts: Record<string, number>
  readonly result: Record<string, number> | null
  readonly createdAt: string
  readonly committedAt: string | null
}

function toBatch(row: Record<string, unknown>): ImportBatchSummary {
  return {
    id: row.id as string,
    kind: row.kind as ImportBatchSummary["kind"],
    fileName: row.file_name as string,
    sha256: row.file_sha256 as string,
    status: row.status as ImportBatchSummary["status"],
    counts: (row.counts as Record<string, number>) ?? {},
    result: (row.result as Record<string, number> | null) ?? null,
    createdAt: row.created_at as string,
    committedAt: (row.committed_at as string | null) ?? null,
  }
}

const BATCH_COLUMNS = "id, kind, file_name, file_sha256, status, counts, result, created_at, committed_at"

export async function listImportBatches(): Promise<readonly ImportBatchSummary[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await (await db())
    .from("import_batches")
    .select(BATCH_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) fail("import batches", error.message)
  return (data as Record<string, unknown>[]).map(toBatch)
}

export interface ImportRowView {
  readonly sheet: string
  readonly rowNumber: number
  readonly status: string
  readonly data: Record<string, unknown>
  readonly issues: readonly { code: string; message: string; column?: string }[]
}

export async function getImportBatch(
  id: string,
  status: string | null
): Promise<{ batch: ImportBatchSummary; rows: readonly ImportRowView[]; shown: number; total: number } | null> {
  const supabase = await db()
  const { data: batch, error } = await supabase.from("import_batches").select(BATCH_COLUMNS).eq("id", id).maybeSingle()
  if (error) fail("import batch", error.message)
  if (!batch) return null

  let query = supabase
    .from("import_rows")
    .select("sheet, row_number, status, data, issues", { count: "exact" })
    .eq("batch_id", id)
    .order("row_number")
    .limit(500)
  query = status ? query.eq("status", status) : query.neq("status", "accepted")
  const { data: rows, error: rowsError, count } = await query
  if (rowsError) fail("import rows", rowsError.message)

  return {
    batch: toBatch(batch as Record<string, unknown>),
    rows: (rows as Record<string, unknown>[]).map((r) => ({
      sheet: r.sheet as string,
      rowNumber: r.row_number as number,
      status: r.status as string,
      data: r.data as Record<string, unknown>,
      issues: (r.issues as ImportRowView["issues"]) ?? [],
    })),
    shown: rows?.length ?? 0,
    total: count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Athletes
// ---------------------------------------------------------------------------

export interface RosterAthlete {
  readonly id: string
  readonly federationNumber: number
  readonly fullName: string
  readonly gender: "M" | "F"
  readonly birthYear: number | null
  readonly club: Club | null
}

/** The athletes the signed-in account may see: a club sees its own current roster only. */
export async function listAthletes(): Promise<readonly RosterAthlete[]> {
  const supabase = await db()
  const { data: season } = await supabase.from("seasons").select("id").eq("code", CURRENT_SEASON).single()
  const data = await allRows<Record<string, unknown>>((from, to) =>
    supabase
      .from("athletes")
      .select("id, federation_number, full_name_ar, gender, birth_year, memberships:club_memberships(valid_to, season_id, club:clubs(code))")
      .eq("is_active", true)
      .order("federation_number")
      .range(from, to)
  )
  return data.map((row) => {
    const memberships = (row.memberships as { valid_to: string | null; season_id: string; club: { code: string } | null }[]) ?? []
    const current = memberships.find((m) => m.valid_to === null && m.season_id === season?.id)
    return {
      id: row.id as string,
      federationNumber: row.federation_number as number,
      fullName: row.full_name_ar as string,
      gender: row.gender as "M" | "F",
      birthYear: (row.birth_year as number | null) ?? null,
      club: current?.club ? (findClub(current.club.code) ?? null) : null,
    }
  })
}

export interface AthleteCounts {
  readonly athletes: number
  readonly missingBirthYear: number
  readonly rankingsNeedingReview: number
}

export async function getAthleteCounts(): Promise<AthleteCounts | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await db()
  const [all, missing, review] = await Promise.all([
    supabase.from("athletes").select("id", { count: "exact", head: true }),
    supabase.from("athletes").select("id", { count: "exact", head: true }).is("birth_year", null),
    supabase.from("previous_season_rankings").select("id", { count: "exact", head: true }).eq("needs_review", true),
  ])
  if (all.error) return null
  return { athletes: all.count ?? 0, missingBirthYear: missing.count ?? 0, rankingsNeedingReview: review.count ?? 0 }
}

// ---------------------------------------------------------------------------
// Events and rounds
// ---------------------------------------------------------------------------

export interface EventSummary {
  readonly id: string
  readonly championship: Championship
  readonly nameAr: string
  readonly venueAr: string | null
  readonly eventDate: string | null
  readonly rounds: number
}

export async function listEvents(): Promise<readonly EventSummary[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await (await db())
    .from("events")
    .select("id, championship, name_ar, venue_ar, event_date, rounds:competition_rounds(id)")
    .order("event_date", { ascending: true, nullsFirst: false })
  if (error) fail("events", error.message)
  return (data as Record<string, unknown>[]).map((e) => ({
    id: e.id as string,
    championship: e.championship as Championship,
    nameAr: e.name_ar as string,
    venueAr: (e.venue_ar as string | null) ?? null,
    eventDate: (e.event_date as string | null) ?? null,
    // Aggregates are off by default in Supabase's API, so count the embedded ids.
    rounds: (e.rounds as unknown[] | null)?.length ?? 0,
  }))
}

export interface RoundView {
  readonly id: string
  readonly eventId: string
  readonly catalogueNumber: number
  readonly race: RaceCode
  readonly roundKey: string
  readonly nameAr: string
  readonly entryMode: "registration" | "advancement"
  readonly status: RoundStatus
  readonly registrationDeadline: string | null
  readonly scheduledAt: string | null
  readonly eligibleCategories: readonly string[]
  readonly activeEntries: number
  /** Set when results this round started from were corrected after approval. */
  readonly needsReview: boolean
  readonly reviewReason: string | null
  /** Clubs register athletes for it: a registration round, or the first round after the Qualifications (Q12). */
  readonly registers: boolean
  /** The first round after the Qualifications: only athletes who raced in them may be entered. */
  readonly qualifiedEntries: boolean
}

const ROUND_COLUMNS =
  "id, event_id, catalogue_number, race_code, round_key, name_ar, entry_mode, status, registration_deadline, scheduled_at, eligible_categories, needs_review, review_reason, created_at"

function toRound(r: Record<string, unknown>, entries: number, championship: Championship): RoundView {
  const qualifiedEntries = r.entry_mode === "advancement" && takesQualifiedEntries(championship, r.race_code as RaceCode, r.round_key as string)
  return {
    id: r.id as string,
    eventId: r.event_id as string,
    catalogueNumber: r.catalogue_number as number,
    race: r.race_code as RaceCode,
    roundKey: r.round_key as string,
    nameAr: r.name_ar as string,
    entryMode: r.entry_mode as RoundView["entryMode"],
    status: r.status as RoundStatus,
    registrationDeadline: (r.registration_deadline as string | null) ?? null,
    scheduledAt: (r.scheduled_at as string | null) ?? null,
    eligibleCategories: (r.eligible_categories as string[]) ?? [],
    activeEntries: entries,
    needsReview: (r.needs_review as boolean | null) ?? false,
    reviewReason: (r.review_reason as string | null) ?? null,
    registers: r.entry_mode === "registration" || qualifiedEntries,
    qualifiedEntries,
  }
}

async function entryCounts(roundIds: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (roundIds.length === 0) return counts
  const { data, error } = await (await db())
    .from("race_entries")
    .select("round_id")
    .in("round_id", roundIds as string[])
    .eq("status", "active")
  if (error) fail("entries", error.message)
  for (const e of data as { round_id: string }[]) counts.set(e.round_id, (counts.get(e.round_id) ?? 0) + 1)
  return counts
}

export async function getEvent(
  id: string
): Promise<{ event: EventSummary; rounds: readonly (RoundView & { blockingPrerequisites: readonly string[] })[] } | null> {
  const supabase = await db()
  const { data: event, error } = await supabase
    .from("events")
    .select("id, championship, name_ar, venue_ar, event_date")
    .eq("id", id)
    .maybeSingle()
  if (error) fail("event", error.message)
  if (!event) return null
  const { data: rounds, error: roundsError } = await supabase
    .from("competition_rounds")
    .select(ROUND_COLUMNS)
    .eq("event_id", id)
    .order("catalogue_number")
    .order("created_at")
  if (roundsError) fail("rounds", roundsError.message)
  const counts = await entryCounts((rounds as { id: string }[]).map((r) => r.id))

  const withBlocking = await Promise.all(
    (rounds as Record<string, unknown>[]).map(async (r) => {
      let blockingPrerequisites: string[] = []
      if (r.status === "draft") {
        const { data } = await supabase.rpc("incomplete_prerequisites", { round: r.id })
        blockingPrerequisites = (data as string[] | null) ?? []
      }
      return { ...toRound(r, counts.get(r.id as string) ?? 0, (event as { championship: Championship }).championship), blockingPrerequisites }
    })
  )

  const e = event as Record<string, unknown>
  return {
    event: {
      id: e.id as string,
      championship: e.championship as Championship,
      nameAr: e.name_ar as string,
      venueAr: (e.venue_ar as string | null) ?? null,
      eventDate: (e.event_date as string | null) ?? null,
      rounds: withBlocking.length,
    },
    rounds: withBlocking,
  }
}

/** Rounds a club can see (never drafts), with the event they belong to. */
export async function listClubRounds(): Promise<readonly (RoundView & { event: EventSummary })[]> {
  const supabase = await db()
  const { data, error } = await supabase
    .from("competition_rounds")
    .select(`${ROUND_COLUMNS}, event:events(id, championship, name_ar, venue_ar, event_date)`)
    .neq("status", "draft")
    .order("registration_deadline", { ascending: true, nullsFirst: false })
  if (error) fail("rounds", error.message)
  // Rounds the club registers for: club-entry rounds, and the first round after the Qualifications (Q12).
  const rows = (data as Record<string, unknown>[]).filter((r) => {
    const championship = (r.event as { championship: Championship }).championship
    return r.entry_mode === "registration" || takesQualifiedEntries(championship, r.race_code as RaceCode, r.round_key as string)
  })
  const counts = await entryCounts(rows.map((r) => r.id as string))
  return rows.map((r) => {
    const e = r.event as Record<string, unknown>
    return {
      ...toRound(r, counts.get(r.id as string) ?? 0, e.championship as Championship),
      event: {
        id: e.id as string,
        championship: e.championship as Championship,
        nameAr: e.name_ar as string,
        venueAr: (e.venue_ar as string | null) ?? null,
        eventDate: (e.event_date as string | null) ?? null,
        rounds: 0,
      },
    }
  })
}

export interface EntryView {
  readonly id: string
  readonly roundId: string
  readonly athleteId: string
  readonly federationNumber: number
  readonly fullName: string
  readonly categoryId: string
  readonly club: Club | null
  readonly submittedAt: string
  readonly exceptionReason: string | null
}

/** Active entries visible to the signed-in account (a club sees only its own). */
export async function listEntries(roundIds: readonly string[]): Promise<readonly EntryView[]> {
  if (roundIds.length === 0) return []
  const { data, error } = await (await db())
    .from("race_entries")
    .select("id, round_id, athlete_id, category_id, submitted_at, exception_reason, athlete:athletes(federation_number, full_name_ar), club:clubs(code)")
    .in("round_id", roundIds as string[])
    .eq("status", "active")
    .order("submitted_at")
  if (error) fail("entries", error.message)
  return (data as Record<string, unknown>[]).map((e) => {
    const athlete = e.athlete as { federation_number: number; full_name_ar: string } | null
    return {
      id: e.id as string,
      roundId: e.round_id as string,
      athleteId: e.athlete_id as string,
      federationNumber: athlete?.federation_number ?? 0,
      fullName: athlete?.full_name_ar ?? "—",
      categoryId: e.category_id as string,
      club: e.club ? (findClub((e.club as { code: string }).code) ?? null) : null,
      submittedAt: e.submitted_at as string,
      exceptionReason: (e.exception_reason as string | null) ?? null,
    }
  })
}

/** The signed-in club's athletes who may be entered in each qualified-entry round (Q12). */
export async function listQualifiedClubAthletes(roundIds: readonly string[]): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  const supabase = await db()
  const pairs = await Promise.all(
    roundIds.map(async (round) => {
      const { data, error } = await supabase.rpc("qualified_club_athletes", { round })
      if (error) fail("qualified athletes", error.message)
      return [round, new Set(((data as string[] | null) ?? []).map(String))] as const
    })
  )
  return new Map(pairs)
}
