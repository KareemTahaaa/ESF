import "server-only"
import catalogue from "@/lib/competition/data/race-catalogue-2026-2027.json"
import { CLUBS, findClub, type Club } from "@/lib/competition/clubs"
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { AccountStatus } from "@/lib/auth/account"
import { listAthletes } from "./competition"

/**
 * Data for the federation and club workspace.
 *
 * Two sources, kept visibly separate in the interface:
 *  - LIVE: what is in the database (club accounts today; athletes, entries and
 *    results once the import and later stages land).
 *  - SOURCE AUDIT: facts measured in the federation's own Excel file before
 *    import. Shown as such, never presented as live data.
 *
 * Demo mode substitutes clearly-marked sample rows for the live part only.
 */

export type Championship = "qualifications" | "national_league" | "egypt_cup"

export interface CatalogueRace {
  readonly number: number
  readonly championship: Championship
  readonly championshipAr: string
  readonly venueAr: string
  readonly surface: "track" | "road"
  readonly raceAr: string
  readonly ruleAr: string
}

export const RACE_CATALOGUE = catalogue.races as readonly CatalogueRace[]

/** Measured in `Egypt Skate Database.xlsm` on 2026-10-31 — see docs/phase-2/SOURCE_MATERIALS_INVENTORY.md. */
export const SOURCE_AUDIT = {
  file: "Egypt Skate Database.xlsm",
  checkedOn: "2026-10-31",
  athletes: 777,
  historicalResults: 3476,
  missingBirthYears: 16,
  rankingsNeedingReview: 138,
} as const

/**
 * Rules that block an official output until the federation answers. Q1, Q3, Q6,
 * Q11 and Q12 were answered on 2026-11-03 (docs/rules/OPEN_QUESTIONS.md).
 */
export const BLOCKED_RULES = [
  { id: "Q10", text: "لا توجد قواعد لسباق التتابع (عدد الفريق، التشكيل، النقاط)", affects: "سباق التتابع 3000م" },
] as const

export interface ClubAccountRequest {
  readonly id: string
  readonly fullName: string
  readonly email: string
  readonly phone: string | null
  readonly position: string | null
  readonly status: AccountStatus
  readonly requestedClub: Club | null
  readonly club: Club | null
  readonly rejectionReason: string | null
  readonly createdAt: string
}

const DEMO_REQUESTS: readonly ClubAccountRequest[] = [
  {
    id: "demo-1",
    fullName: "مثال: أحمد محمود",
    email: "coach.zsc@example.org",
    phone: "01000000001",
    position: "مدير النشاط",
    status: "pending",
    requestedClub: findClub("ZSC") ?? null,
    club: null,
    rejectionReason: null,
    createdAt: "2026-11-01T09:12:00Z",
  },
  {
    id: "demo-2",
    fullName: "مثال: منى سامي",
    email: "skating.city@example.org",
    phone: "01000000002",
    position: "مدربة أولى",
    status: "pending",
    requestedClub: findClub("CITY") ?? null,
    club: null,
    rejectionReason: null,
    createdAt: "2026-10-31T17:40:00Z",
  },
  {
    id: "demo-3",
    fullName: "مثال: كريم عادل",
    email: "admin.ssc@example.org",
    phone: "01000000003",
    position: "إداري الفريق",
    status: "approved",
    requestedClub: findClub("SSC") ?? null,
    club: findClub("SSC") ?? null,
    rejectionReason: null,
    createdAt: "2026-10-30T11:05:00Z",
  },
  {
    id: "demo-4",
    fullName: "مثال: حساب مكرر",
    email: "duplicate@example.org",
    phone: null,
    position: "غير محدد",
    status: "rejected",
    requestedClub: findClub("WDC") ?? null,
    club: null,
    rejectionReason: "لا يوجد ما يثبت تمثيل النادي. تواصل مع الاتحاد.",
    createdAt: "2026-10-29T08:00:00Z",
  },
]

export async function listClubAccounts(): Promise<readonly ClubAccountRequest[]> {
  if (isDemoMode()) return DEMO_REQUESTS
  if (!isSupabaseConfigured()) return []

  const supabase = await createSupabaseServerClient()
  // RLS returns rows only to an approved federation admin.
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, phone, position, status, rejection_reason, created_at, " +
        "club:clubs!profiles_club_id_fkey(code), requested:clubs!profiles_requested_club_id_fkey(code)"
    )
    .eq("role", "club_admin")
    .order("created_at", { ascending: false })

  if (error) throw new Error(`Could not load club accounts: ${error.message}`)

  return (data as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string,
    email: row.email as string,
    phone: (row.phone as string | null) ?? null,
    position: (row.position as string | null) ?? null,
    status: row.status as AccountStatus,
    requestedClub: row.requested ? (findClub((row.requested as { code: string }).code) ?? null) : null,
    club: row.club ? (findClub((row.club as { code: string }).code) ?? null) : null,
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    createdAt: row.created_at as string,
  }))
}

export interface FederationOverview {
  readonly clubs: number
  readonly accounts: { readonly pending: number; readonly approved: number }
  readonly racesInCatalogue: number
  readonly isDemo: boolean
}

export async function getFederationOverview(): Promise<FederationOverview> {
  const accounts = await listClubAccounts()
  return {
    clubs: CLUBS.length,
    accounts: {
      pending: accounts.filter((a) => a.status === "pending").length,
      approved: accounts.filter((a) => a.status === "approved").length,
    },
    racesInCatalogue: RACE_CATALOGUE.length,
    isDemo: isDemoMode(),
  }
}

/** Sample roster for the demo club dashboard. Synthetic names; birth years drive the real rules engine. */
export interface RosterAthlete {
  /** Database id; absent for demo-mode sample rows. */
  readonly id?: string
  readonly federationNumber: number
  readonly fullName: string
  readonly gender: "M" | "F"
  readonly birthYear: number | null
}

const DEMO_ROSTER: readonly RosterAthlete[] = [
  { federationNumber: 9001, fullName: "مثال: لاعبة أولى", gender: "F", birthYear: 2007 },
  { federationNumber: 9002, fullName: "مثال: لاعب ثانٍ", gender: "M", birthYear: 2010 },
  { federationNumber: 9003, fullName: "مثال: لاعبة ثالثة", gender: "F", birthYear: 2012 },
  { federationNumber: 9004, fullName: "مثال: لاعب رابع", gender: "M", birthYear: 2013 },
  { federationNumber: 9005, fullName: "مثال: لاعبة خامسة", gender: "F", birthYear: 2015 },
  { federationNumber: 9006, fullName: "مثال: لاعب سادس", gender: "M", birthYear: 2016 },
  { federationNumber: 9007, fullName: "مثال: لاعبة سابعة", gender: "F", birthYear: 2019 },
  { federationNumber: 9008, fullName: "مثال: لاعب بلا سنة ميلاد", gender: "M", birthYear: null },
]

export async function getClubRoster(_club: Club): Promise<readonly RosterAthlete[] | null> {
  if (isDemoMode()) return DEMO_ROSTER
  if (!isSupabaseConfigured()) return null
  // Row Level Security returns only athletes currently registered to the
  // signed-in admin's club, whatever club is passed here.
  const athletes = await listAthletes()
  return athletes.length === 0 ? null : athletes
}
