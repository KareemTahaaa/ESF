import "server-only"
import { CLUBS } from "@/lib/competition/clubs"
import type { LineStatus } from "@/lib/competition/results"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import type { CategoryId, Championship, RaceCode } from "@/lib/competition/rules/types"
import { championshipStandings, raceStandings, type ChampionshipStandings, type RaceInput, type RoundResults } from "@/lib/competition/standings"
import { allRows } from "@/lib/supabase/all-rows"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { CURRENT_SEASON } from "./competition"

/** Championships that award season points (the Qualifications do not — Q20). */
export const STANDINGS_CHAMPIONSHIPS = ["national_league", "egypt_cup"] as const
export type StandingsChampionship = (typeof STANDINGS_CHAMPIONSHIPS)[number]

/**
 * This season's points and standings, recomputed from results on every request.
 *
 * Runs as the signed-in user, so Row Level Security decides which results
 * count: federation staff see approved and published results (unpublished ones
 * are marked), clubs and the public see published results only.
 */
export async function loadStandings(): Promise<Record<StandingsChampionship, ChampionshipStandings> | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createSupabaseServerClient()

  const { data: season } = await supabase.from("seasons").select("id").eq("code", CURRENT_SEASON).maybeSingle()
  if (!season) return null

  const { data: rounds, error } = await supabase
    .from("competition_rounds")
    .select("id, race_code, round_key, status, event:events!inner(name_ar, championship, season_id)")
    .eq("event.season_id", season.id as string)
    .in("event.championship", [...STANDINGS_CHAMPIONSHIPS])
    .neq("status", "cancelled")
  if (error) throw new Error(`Could not load rounds: ${error.message}`)
  const roundRows = (rounds ?? []) as unknown as {
    id: string
    race_code: RaceCode
    round_key: string
    event: { name_ar: string; championship: Championship }
  }[]

  const { data: sets, error: setsError } = roundRows.length
    ? await supabase.from("result_sets").select("id, round_id, status").in("round_id", roundRows.map((r) => r.id)).in("status", ["approved", "published"])
    : { data: [], error: null }
  if (setsError) throw new Error(`Could not load results: ${setsError.message}`)
  const setRows = (sets ?? []) as { id: string; round_id: string; status: "approved" | "published" }[]

  const lines = setRows.length
    ? await allRows<{
        result_set_id: string
        athlete_id: string
        federation_number: number
        full_name_ar: string
        club_code: string
        event_number: number
        category_id: CategoryId
        heat_number: number | null
        status: LineStatus
        time_cs: number | null
        position: number | null
      }>((from, to) =>
        supabase
          .from("result_lines")
          .select("result_set_id, athlete_id, federation_number, full_name_ar, club_code, event_number, category_id, heat_number, status, time_cs, position")
          .in("result_set_id", setRows.map((s) => s.id))
          .order("result_set_id")
          .order("athlete_id")
          .range(from, to)
      )
    : []
  const linesBySet = new Map<string, typeof lines>()
  for (const l of lines) linesBySet.set(l.result_set_id, [...(linesBySet.get(l.result_set_id) ?? []), l])

  // One race per championship and distance, across all its rounds and events.
  const races = new Map<string, { championship: Championship; race: RaceCode; roundKeys: string[]; results: RoundResults[] }>()
  for (const r of roundRows) {
    if (r.race_code === "relay_3000") continue
    const key = `${r.event.championship}|${r.race_code}`
    const race = races.get(key) ?? { championship: r.event.championship, race: r.race_code, roundKeys: [], results: [] }
    race.roundKeys.push(r.round_key)
    const set = setRows.find((s) => s.round_id === r.id)
    if (set) {
      race.results.push({
        roundId: r.id,
        roundKey: r.round_key,
        resultSetId: set.id,
        eventName: r.event.name_ar,
        published: set.status === "published",
        lines: (linesBySet.get(set.id) ?? []).map((l) => ({
          athleteId: l.athlete_id,
          federationNumber: l.federation_number,
          fullName: l.full_name_ar,
          clubCode: l.club_code,
          eventNumber: l.event_number,
          categoryId: l.category_id,
          heatNumber: l.heat_number,
          status: l.status,
          timeCs: l.time_cs,
          position: l.position,
        })),
      })
    }
    races.set(key, race)
  }

  const raceResults = [...races.values()].flatMap((r) => raceStandings(r as RaceInput, SEASON_2026_2027))
  const clubCodes = CLUBS.filter((c) => !c.isForeign).map((c) => c.code)
  return {
    national_league: championshipStandings("national_league", raceResults, clubCodes, SEASON_2026_2027),
    egypt_cup: championshipStandings("egypt_cup", raceResults, clubCodes, SEASON_2026_2027),
  }
}
