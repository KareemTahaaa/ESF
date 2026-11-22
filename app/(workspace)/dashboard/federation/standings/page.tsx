import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { StandingsView } from "@/components/workspace/standings-view"
import { requireAccount } from "@/lib/auth/account"
import { STANDINGS_CHAMPIONSHIPS, loadStandings, type StandingsChampionship } from "@/lib/workspace/standings"

export const metadata: Metadata = { title: "الترتيب والنقاط — الاتحاد المصري للتزلج" }

export default async function FederationStandingsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const account = await requireAccount()
  if (account.role === "club_admin") redirect("/dashboard/club/results")
  const { c } = await searchParams
  const championship: StandingsChampionship = STANDINGS_CHAMPIONSHIPS.includes(c as StandingsChampionship) ? (c as StandingsChampionship) : "national_league"
  const standings = account.isDemo ? null : await loadStandings()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">الترتيب والنقاط</h1>
        <p className="max-w-2xl leading-relaxed text-ws-muted">
          نقاط اللاعبين وترتيب الأندية في الدوري العام وكأس مصر، محسوبة تلقائياً من النتائج المعتمدة. لا يُخزَّن أي رقم يدوياً، فتصحيح
          نتيجة وإعادة اعتمادها يحدّث الترتيب مباشرة.
        </p>
      </header>
      {standings ? (
        <StandingsView standings={standings} championship={championship} basePath="/dashboard/federation/standings" showUnpublished />
      ) : (
        <p className="text-ws-muted">الترتيب يحتاج إلى ربط قاعدة البيانات، وهو غير متاح في وضع العرض.</p>
      )}
    </div>
  )
}
