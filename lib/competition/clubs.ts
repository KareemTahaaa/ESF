/**
 * Clubs registered with the federation.
 *
 * Taken from the `Club Codes` sheet of `Egypt Skate Database.xlsm`, limited to
 * the 13 clubs that have athletes in the `Database` sheet. The same list seeds
 * the `clubs` table in supabase/migrations/0001_accounts.sql; keep them in step.
 *
 * Club names and codes are public information, so the signup form can list
 * them before anyone is signed in.
 */

export interface Club {
  /** Federation club code, as used in start lists (`Club` column). */
  readonly code: string
  readonly nameAr: string
  /** A foreign federation entered in national events, not an Egyptian club. */
  readonly isForeign?: boolean
}

export const CLUBS: readonly Club[] = [
  { code: "WDC", nameAr: "وادي دجلة" },
  { code: "TGC", nameAr: "طلائع الجيش" },
  { code: "SSC", nameAr: "الشمس" },
  { code: "ZSC", nameAr: "الزهور" },
  { code: "AERO", nameAr: "ايروسبورت" },
  { code: "MSC", nameAr: "المقطم" },
  { code: "MYC", nameAr: "مركز شباب المدينة" },
  { code: "OSC", nameAr: "العبور" },
  { code: "NCSC", nameAr: "مدينة نصر" },
  { code: "CITY", nameAr: "سيتي كلوب" },
  { code: "AESC", nameAr: "الصيد بالاسكندرية" },
  { code: "SUD", nameAr: "الاتحاد السوداني العام", isForeign: true },
  { code: "NPC", nameAr: "النصر للبترول" },
]

export function findClub(code: string): Club | undefined {
  return CLUBS.find((club) => club.code === code)
}
