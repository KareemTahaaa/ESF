/**
 * Supabase configuration.
 *
 * The workspace must build and run before the Supabase project exists, so every
 * caller checks `isSupabaseConfigured()` instead of assuming the keys are set.
 * Only the public URL and publishable (anon) key are read here; the secret /
 * service-role key is never used by the website.
 */

export interface SupabasePublicConfig {
  readonly url: string
  readonly anonKey: string
}

export function getSupabaseConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Newer Supabase projects issue a "publishable" key (sb_publishable_…) in place
  // of the legacy anon key; both are browser-safe and work the same way here.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null
}

/**
 * Demo mode renders the workspace with sample data so its design can be
 * reviewed before the Supabase project exists.
 *
 * It needs BOTH an explicit opt-in (`ESF_DEMO_MODE=1`) AND the absence of
 * Supabase keys. Once the project is connected, demo mode can never activate,
 * so it cannot become a way around real authentication.
 */
export function isDemoMode(): boolean {
  return process.env.ESF_DEMO_MODE === "1" && !isSupabaseConfigured()
}
