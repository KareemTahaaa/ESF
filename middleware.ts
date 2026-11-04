import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseConfig } from "@/lib/supabase/config"

/**
 * Refreshes the Supabase session and keeps signed-out visitors out of the
 * workspace. Scoped by `matcher` to the workspace and auth routes only, so the
 * public website is untouched.
 *
 * This is a convenience redirect, not the security boundary: every workspace
 * page re-checks the account on the server, and Row Level Security enforces
 * club isolation in the database.
 */
export async function middleware(request: NextRequest) {
  const config = getSupabaseConfig()
  if (!config) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup/:path*", "/pending", "/auth/:path*", "/forgot-password", "/reset-password"],
}
