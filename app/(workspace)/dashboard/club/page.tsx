import type { Metadata } from "next"
import Link from "next/link"
import { ClubBib } from "@/components/workspace/bib"
import { StatusChip } from "@/components/workspace/status-chip"
import { requireClubAdmin } from "@/lib/auth/account"
import { assignCategory } from "@/lib/competition/rules/age-category"
import { eligibleRaces, middleDistanceFor } from "@/lib/competition/rules/eligibility"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import type { CategoryId, RaceCode } from "@/lib/competition/rules/types"
import { RACE_CATALOGUE, getClubRoster } from "@/lib/workspace/data"

export const metadata: Metadata = { title: "لوحة النادي — الاتحاد المصري للتزلج" }

function raceLabel(race: RaceCode, category: CategoryId): string {
  switch (race) {
    case "100m":
      return "100m"
    case "one_lap":
      return "One Lap"
    case "200m":
      return "200m"
    case "500m":
      return "500m"
    case "middle":
      return `${middleDistanceFor(category)}m`
    case "points_5000_track":
      return "5K نقاط"
    case "points_10000_road":
      return "10K نقاط"
    case "elimination_10000_track":
      return "10K إقصاء"
    case "elimination_15000_road":
      return "15K إقصاء"
    case "relay_3000":
      return "تتابع"
  }
}

export default async function ClubOverviewPage() {
  const account = await requireClubAdmin()
  const roster = await getClubRoster(account.club)

  const championships = [
    { id: "qualifications", label: "جولة التصفيات" },
    { id: "national_league", label: "الدوري العام" },
    { id: "egypt_cup", label: "كأس مصر" },
  ] as const

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-center gap-5">
        <ClubBib code={account.club.code} name={account.club.nameAr} size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className="font-extrabold text-3xl text-ws-ink">{account.club.nameAr}</h1>
          <p className="text-ws-muted">موسم سباقات السرعة <bdi dir="ltr">2026–2027</bdi></p>
        </div>
      </header>

      <section className="flex flex-col gap-2 rounded-md border border-ws-rule bg-ws-raised p-5 sm:flex-row sm:items-center sm:gap-6">
        <p className="flex-1 leading-relaxed text-ws-soft">
          يفتح الاتحاد التسجيل لكل سباق مع موعده النهائي. اختر من لاعبي ناديك من تريد تسجيله، ويتحقق النظام من أهلية كل لاعب
          للمسافة قبل الإرسال.
        </p>
        <Link href="/dashboard/club/entries" className="shrink-0 self-start rounded-md bg-ws-ink px-4 py-2 text-sm font-medium text-ws-paper hover:opacity-90 sm:self-center">
          التسجيل في السباقات
        </Link>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ws-ink">لاعبو النادي</h2>
          {roster ? <p className="text-sm text-ws-muted tabular">{roster.length} لاعب</p> : null}
        </div>

        {roster === null ? (
          <div className="rounded-md border border-dashed border-ws-rule px-6 py-12 text-center leading-relaxed text-ws-muted">
            تظهر قائمة لاعبي النادي هنا بعد أن يستورد الاتحاد بيانات اللاعبين المسجلين.
            <br />
            لإضافة لاعب جديد أرسل <Link href="/dashboard/club/requests" className="underline">طلباً للاتحاد</Link>.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-ws-rule bg-ws-raised">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-ws-sunk text-ws-muted">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">الرقم</th>
                  <th className="px-4 py-2.5 text-start font-medium">الاسم</th>
                  <th className="px-4 py-2.5 text-start font-medium">النوع</th>
                  <th className="px-4 py-2.5 text-start font-medium">سنة الميلاد</th>
                  <th className="px-4 py-2.5 text-start font-medium">المرحلة <bdi dir="ltr">2026–2027</bdi></th>
                  <th className="px-4 py-2.5 text-start font-medium">المسافات المتاحة في الدوري</th>
                  <th className="px-4 py-2.5 text-start font-medium"><span className="sr-only">طلب تصحيح</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ws-rule">
                {roster.map((athlete) => {
                  const assignment = assignCategory(athlete.birthYear, SEASON_2026_2027)
                  return (
                    <tr key={athlete.federationNumber} className="align-top">
                      <td className="px-4 py-3 text-ws-muted tabular">{athlete.federationNumber}</td>
                      <td className="px-4 py-3 font-medium text-ws-ink">{athlete.fullName}</td>
                      <td className="px-4 py-3 text-ws-soft">{athlete.gender === "F" ? "بنات" : "بنين"}</td>
                      <td className="px-4 py-3 text-ws-soft tabular">{athlete.birthYear ?? "—"}</td>
                      <td className="px-4 py-3">
                        {assignment.resolved ? (
                          <span className="text-ws-ink">{assignment.category.nameAr}</span>
                        ) : (
                          <StatusChip tone="stop">سنة الميلاد غير مسجلة</StatusChip>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {assignment.resolved ? (
                          <div dir="ltr" className="flex flex-wrap justify-end gap-1">
                            {eligibleRaces("national_league", assignment.category.id).map((race) => (
                              <span key={race} className="rounded bg-ws-sunk px-1.5 py-0.5 text-xs text-ws-soft">
                                {raceLabel(race, assignment.category.id)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-ws-muted">لا يمكن تسجيله حتى يستكمل الاتحاد البيانات</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {athlete.id ? (
                          <Link href={`/dashboard/club/requests?athlete=${athlete.id}`} className="whitespace-nowrap text-xs text-ws-muted hover:text-ws-ink hover:underline">
                            طلب تصحيح
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-ws-muted">
          المرحلة العمرية والمسافات المتاحة محسوبة من سنة الميلاد وفق المادتين 3 و7 من لوائح الموسم. لتصحيح بيانات لاعب أو
          تسجيل لاعب جديد، أرسل طلباً للاتحاد.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-ws-ink">سباقات الموسم</h2>
        <ul className="grid gap-px overflow-hidden rounded-md border border-ws-rule bg-ws-rule sm:grid-cols-3">
          {championships.map((c) => {
            const races = RACE_CATALOGUE.filter((r) => r.championship === c.id)
            return (
              <li key={c.id} className="flex flex-col gap-1 bg-ws-raised px-5 py-4">
                <p className="font-medium text-ws-ink">{c.label}</p>
                {/* Each count is its own isolated run, so Latin and Arabic don't reorder. */}
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ws-muted tabular">
                  <span>{races.length} سباقات</span>
                  <bdi dir="ltr">Track {races.filter((r) => r.surface === "track").length}</bdi>
                  <bdi dir="ltr">Road {races.filter((r) => r.surface === "road").length}</bdi>
                </p>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
