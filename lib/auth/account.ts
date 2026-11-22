import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { findClub, type Club } from "@/lib/competition/clubs"
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * The signed-in account, resolved on the server.
 *
 * Every workspace page calls one of the `require*` functions below. Hiding a
 * link is not authorization: these checks run on every request, and Row Level
 * Security enforces the same rules again in the database.
 */

export type AccountRole = "federation_admin" | "results_official" | "club_admin"
export type AccountStatus = "pending" | "approved" | "rejected" | "suspended"

export interface Account {
  readonly id: string
  readonly email: string
  readonly fullName: string
  readonly role: AccountRole
  readonly status: AccountStatus
  /** The club the federation confirmed. Only this grants access to club data. */
  readonly club: Club | null
  /** The club the person asked to represent at signup. Unverified. */
  readonly requestedClub: Club | null
  readonly rejectionReason: string | null
  /** True when rendered from sample data in demo mode. */
  readonly isDemo: boolean
}

export const DEMO_ROLE_COOKIE = "esf_demo_role"

const DEMO_ACCOUNTS: Readonly<Record<string, Account>> = {
  federation: {
    id: "demo-federation",
    email: "admin@example.org",
    fullName: "مسؤول الاتحاد (تجريبي)",
    role: "federation_admin",
    status: "approved",
    club: null,
    requestedClub: null,
    rejectionReason: null,
    isDemo: true,
  },
  club: {
    id: "demo-club",
    email: "club@example.org",
    fullName: "مسؤول النادي (تجريبي)",
    role: "club_admin",
    status: "approved",
    club: findClub("SSC") ?? null,
    requestedClub: findClub("SSC") ?? null,
    rejectionReason: null,
    isDemo: true,
  },
  pending: {
    id: "demo-pending",
    email: "new-club@example.org",
    fullName: "طلب حساب جديد (تجريبي)",
    role: "club_admin",
    status: "pending",
    club: null,
    requestedClub: findClub("ZSC") ?? null,
    rejectionReason: null,
    isDemo: true,
  },
}

export async function getCurrentAccount(): Promise<Account | null> {
  if (isDemoMode()) {
    const role = (await cookies()).get(DEMO_ROLE_COOKIE)?.value
    return role ? (DEMO_ACCOUNTS[role] ?? null) : null
  }
  if (!isSupabaseConfigured()) return null

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, role, status, rejection_reason, " +
        "club:clubs!profiles_club_id_fkey(code), requested:clubs!profiles_requested_club_id_fkey(code)"
    )
    .eq("id", user.id)
    .single()

  if (error || !profile) return null

  const row = profile as unknown as {
    id: string
    email: string
    full_name: string
    role: AccountRole
    status: AccountStatus
    rejection_reason: string | null
    club: { code: string } | null
    requested: { code: string } | null
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    club: row.club ? (findClub(row.club.code) ?? null) : null,
    requestedClub: row.requested ? (findClub(row.requested.code) ?? null) : null,
    rejectionReason: row.rejection_reason,
    isDemo: false,
  }
}

/** Any signed-in account, approved or not. */
export async function requireAccount(): Promise<Account> {
  const account = await getCurrentAccount()
  if (!account) redirect("/login")
  return account
}

/** An approved federation admin. Everyone else is sent to their own home. */
export async function requireFederationAdmin(): Promise<Account> {
  const account = await requireAccount()
  if (account.role !== "federation_admin" || account.status !== "approved") {
    redirect(homeFor(account))
  }
  return account
}

/** An approved club admin with a confirmed club. */
export async function requireClubAdmin(): Promise<Account & { club: Club }> {
  const account = await requireAccount()
  if (account.role !== "club_admin" || account.status !== "approved" || !account.club) {
    redirect(homeFor(account))
  }
  return account as Account & { club: Club }
}

/** Where an account lands after signing in. */
export function homeFor(account: Account): string {
  if (account.status !== "approved") return "/pending"
  if (account.role === "club_admin") return "/dashboard/club"
  return "/dashboard/federation"
}

/** Only internal paths are accepted as a post-login destination. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null
  return next
}
