import { NextResponse, type NextRequest } from "next/server"
import { safeNextPath } from "@/lib/auth/account"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Landing point for the email-confirmation and password-reset links. Exchanges the one-time code
 * for a session, then continues to an internal path only.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = safeNextPath(searchParams.get("next")) ?? "/pending"

  if (code && isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  if (next === "/reset-password") return NextResponse.redirect(`${origin}/forgot-password?error=expired`)
  return NextResponse.redirect(`${origin}/login?error=confirmation`)
}
