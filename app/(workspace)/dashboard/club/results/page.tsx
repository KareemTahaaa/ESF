import type { Metadata } from "next"
import { StandingsView } from "@/components/workspace/standings-view"
import { requireClubAdmin } from "@/lib/auth/account"
import { STANDINGS_CHAMPIONSHIPS, loadStandings, type StandingsChampionship } from "@/lib/workspace/standings"

export const metadata: Metadata = { title: "النتائج والترتيب — الاتحاد المصري للتزلج" }

export default async function ClubResultsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const account = await requireClubAdmin()
  const { c } = await searchParams
  const championship: StandingsChampionship = STANDINGS_CHAMPIONSHIPS.includes(c as StandingsChampionship) ? (c as StandingsChampionship) : "national_league"
  // Row Level Security gives clubs published results only.
  const standings = account.isDemo ? null : await loadStandings()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">النتائج والترتيب</h1>
        <p className="max-w-2xl leading-relaxed text-ws-muted">
          النتائج التي نشرها الاتحاد، ونقاط اللاعبين، وترتيب الأندية في الدوري العام وكأس مصر. صفوف {account.club.nameAr} مظللة.
        </p>
      </header>
      {standings ? (
        <StandingsView
          standings={standings}
          championship={championship}
          basePath="/dashboard/club/results"
          highlightClub={account.club.code}
          showUnpublished={false}
        />
      ) : (
        <p className="text-ws-muted">الترتيب يحتاج إلى ربط قاعدة البيانات، وهو غير متاح في وضع العرض.</p>
      )}
    </div>
  )
}
