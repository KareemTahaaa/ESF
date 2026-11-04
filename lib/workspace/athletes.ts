import "server-only"
import { findClub, type Club } from "@/lib/competition/clubs"
import { allRows } from "@/lib/supabase/all-rows"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { CURRENT_SEASON } from "./competition"

/**
 * Athlete registry and club requests, read as the signed-in user. Row Level
 * Security decides what comes back: federation staff see every athlete and
 * request, a club only its own.
 */

export interface RegistryAthlete {
  readonly id: string
  readonly federationNumber: number
  readonly registrationNumber: string | null
  readonly fullName: string
  readonly gender: "M" | "F"
  readonly birthYear: number | null
  readonly isActive: boolean
  readonly club: Club | null
}

export async function listRegistry(): Promise<readonly RegistryAthlete[]> {
  const supabase = await createSupabaseServerClient()
  const { data: season } = await supabase.from("seasons").select("id").eq("code", CURRENT_SEASON).single()
  const data = await allRows<Record<string, unknown>>((from, to) =>
    supabase
      .from("athletes")
      .select(
        "id, federation_number, registration_number, full_name_ar, gender, birth_year, is_active, memberships:club_memberships(valid_to, season_id, club:clubs(code))"
      )
      .order("federation_number")
      .range(from, to)
  )
  return data.map((row) => {
    const memberships = (row.memberships as { valid_to: string | null; season_id: string; club: { code: string } | null }[]) ?? []
    const current = memberships.find((m) => m.valid_to === null && m.season_id === season?.id)
    return {
      id: row.id as string,
      federationNumber: row.federation_number as number,
      registrationNumber: (row.registration_number as string | null) ?? null,
      fullName: row.full_name_ar as string,
      gender: row.gender as "M" | "F",
      birthYear: (row.birth_year as number | null) ?? null,
      isActive: row.is_active as boolean,
      club: current?.club ? (findClub(current.club.code) ?? null) : null,
    }
  })
}

export interface AthleteDetail extends RegistryAthlete {
  readonly memberships: readonly { club: Club | null; season: string; validFrom: string; validTo: string | null }[]
  readonly entries: readonly { round: string; race: string; event: string; status: string; category: string }[]
  readonly history: readonly { action: string; at: string; detail: Record<string, unknown> }[]
}

export async function getAthleteDetail(id: string): Promise<AthleteDetail | null> {
  const supabase = await createSupabaseServerClient()
  const { data: row, error } = await supabase
    .from("athletes")
    .select(
      "id, federation_number, registration_number, full_name_ar, gender, birth_year, is_active, " +
        "memberships:club_memberships(valid_from, valid_to, club:clubs(code), season:seasons(code)), " +
        "entries:race_entries(status, category_id, round:competition_rounds(name_ar, race_code, event:events(name_ar)))"
    )
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`Could not load athlete: ${error.message}`)
  if (!row) return null
  const r = row as unknown as Record<string, unknown>

  const { data: audit } = await supabase
    .from("audit_log")
    .select("action, created_at, detail")
    .eq("target_type", "athlete")
    .eq("target_id", id)
    .order("created_at", { ascending: false })
    .limit(50)

  const memberships = ((r.memberships as Record<string, unknown>[]) ?? [])
    .map((m) => ({
      club: m.club ? (findClub((m.club as { code: string }).code) ?? null) : null,
      season: (m.season as { code: string } | null)?.code ?? "",
      validFrom: m.valid_from as string,
      validTo: (m.valid_to as string | null) ?? null,
    }))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
  const current = memberships.find((m) => m.validTo === null && m.season === CURRENT_SEASON)

  return {
    id: r.id as string,
    federationNumber: r.federation_number as number,
    registrationNumber: (r.registration_number as string | null) ?? null,
    fullName: r.full_name_ar as string,
    gender: r.gender as "M" | "F",
    birthYear: (r.birth_year as number | null) ?? null,
    isActive: r.is_active as boolean,
    club: current?.club ?? null,
    memberships,
    entries: ((r.entries as Record<string, unknown>[]) ?? []).map((e) => {
      const round = e.round as { name_ar: string; race_code: string; event: { name_ar: string } | null } | null
      return {
        round: round?.name_ar ?? "",
        race: round?.race_code ?? "",
        event: round?.event?.name_ar ?? "",
        status: e.status as string,
        category: e.category_id as string,
      }
    }),
    history: ((audit ?? []) as Record<string, unknown>[]).map((a) => ({
      action: a.action as string,
      at: a.created_at as string,
      detail: (a.detail as Record<string, unknown>) ?? {},
    })),
  }
}

export type RequestStatus = "pending" | "approved" | "rejected" | "withdrawn"

export interface AthleteRequest {
  readonly id: string
  readonly kind: "new_athlete" | "correction"
  readonly club: Club | null
  readonly athlete: { readonly id: string; readonly federationNumber: number; readonly fullName: string; readonly birthYear: number | null; readonly gender: "M" | "F"; readonly registrationNumber: string | null } | null
  readonly proposed: { full_name_ar?: string; birth_year?: number; gender?: "M" | "F"; registration_number?: string }
  readonly note: string | null
  readonly status: RequestStatus
  readonly submittedAt: string
  readonly reviewNote: string | null
  readonly reviewedAt: string | null
}

export async function listAthleteRequests(status?: RequestStatus): Promise<readonly AthleteRequest[]> {
  const supabase = await createSupabaseServerClient()
  let query = supabase
    .from("athlete_requests")
    .select(
      "id, kind, proposed, note, status, submitted_at, review_note, reviewed_at, club:clubs(code), " +
        "athlete:athletes!athlete_requests_athlete_id_fkey(id, federation_number, full_name_ar, birth_year, gender, registration_number)"
    )
    .order("submitted_at", { ascending: false })
    .limit(200)
  if (status) query = query.eq("status", status)
  const { data, error } = await query
  if (error) throw new Error(`Could not load requests: ${error.message}`)
  return (data as unknown as Record<string, unknown>[]).map((r) => {
    const a = r.athlete as Record<string, unknown> | null
    return {
      id: r.id as string,
      kind: r.kind as AthleteRequest["kind"],
      club: r.club ? (findClub((r.club as { code: string }).code) ?? null) : null,
      athlete: a
        ? {
            id: a.id as string,
            federationNumber: a.federation_number as number,
            fullName: a.full_name_ar as string,
            birthYear: (a.birth_year as number | null) ?? null,
            gender: a.gender as "M" | "F",
            registrationNumber: (a.registration_number as string | null) ?? null,
          }
        : null,
      proposed: r.proposed as AthleteRequest["proposed"],
      note: (r.note as string | null) ?? null,
      status: r.status as RequestStatus,
      submittedAt: r.submitted_at as string,
      reviewNote: (r.review_note as string | null) ?? null,
      reviewedAt: (r.reviewed_at as string | null) ?? null,
    }
  })
}

export async function countPendingRequests(): Promise<number> {
  const supabase = await createSupabaseServerClient()
  const { count } = await supabase.from("athlete_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
  return count ?? 0
}

/** The next unused federation number, offered as a default when adding an athlete. */
export async function nextFederationNumber(): Promise<number> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from("athletes").select("federation_number").order("federation_number", { ascending: false }).limit(1)
  return ((data?.[0]?.federation_number as number | undefined) ?? 0) + 1
}
