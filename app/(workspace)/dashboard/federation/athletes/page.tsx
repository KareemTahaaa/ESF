import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ClubBib } from "@/components/workspace/bib"
import { inputClass } from "@/components/workspace/form"
import { StatusChip } from "@/components/workspace/status-chip"
import { requireAccount } from "@/lib/auth/account"
import { normaliseArabic } from "@/lib/competition/arabic"
import { CLUBS } from "@/lib/competition/clubs"
import { assignCategory } from "@/lib/competition/rules/age-category"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import { countPendingRequests, listRegistry, nextFederationNumber } from "@/lib/workspace/athletes"
import { AddAthleteForm } from "./forms"

export const metadata: Metadata = { title: "اللاعبون — الاتحاد المصري للتزلج" }

const PAGE = 100

export default async function AthletesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; club?: string; show?: string; page?: string }>
}) {
  const account = await requireAccount()
  if (account.role === "club_admin") redirect("/dashboard/club")
  if (account.isDemo) return <p className="text-ws-muted">سجل اللاعبين يحتاج إلى ربط قاعدة البيانات.</p>

  const { q = "", club = "", show = "", page = "1" } = await searchParams
  const isAdmin = account.role === "federation_admin"
  const [all, pending, nextNumber] = await Promise.all([listRegistry(), countPendingRequests(), isAdmin ? nextFederationNumber() : 0])

  const needle = normaliseArabic(q)
  const filtered = all.filter((a) => {
    if (club && a.club?.code !== club) return false
    if (show === "missing" && a.birthYear !== null) return false
    if (show === "inactive" ? a.isActive : !a.isActive) return false
    if (!needle) return true
    return String(a.federationNumber) === needle || normaliseArabic(a.fullName).includes(needle)
  })
  const pageNumber = Math.max(1, Number(page) || 1)
  const shown = filtered.slice((pageNumber - 1) * PAGE, pageNumber * PAGE)
  const missing = all.filter((a) => a.isActive && a.birthYear === null).length
  const query = (extra: Record<string, string>) =>
    "?" + new URLSearchParams({ ...(q ? { q } : {}), ...(club ? { club } : {}), ...(show ? { show } : {}), ...extra }).toString()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">اللاعبون</h1>
        <p className="max-w-2xl leading-relaxed text-ws-muted">
          سجل الاتحاد الرسمي. كل تعديل أو إضافة أو انتقال يحتاج سبباً، ويُحفظ في السجل بقيمته قبل وبعد. تقترح الأندية التصحيحات
          واللاعبين الجدد، ولا يتغير شيء إلا بموافقة الاتحاد.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        {pending > 0 ? (
          <Link href="/dashboard/federation/requests" className="rounded-md bg-ws-wait-wash px-4 py-2 text-sm font-medium text-ws-wait">
            {pending} طلب من الأندية بانتظار المراجعة
          </Link>
        ) : null}
        {missing > 0 ? (
          <Link href={query({ show: "missing" })} className="rounded-md bg-ws-stop-wash px-4 py-2 text-sm font-medium text-ws-stop">
            {missing} لاعباً بلا سنة ميلاد — لا يمكن تسجيلهم في السباقات
          </Link>
        ) : null}
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/dashboard/federation/athletes">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm text-ws-muted">
          بحث بالاسم أو الرقم
          <input name="q" defaultValue={q} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ws-muted">
          النادي
          <select name="club" defaultValue={club} className={inputClass + " w-auto"}>
            <option value="">كل الأندية</option>
            {CLUBS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nameAr}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ws-muted">
          عرض
          <select name="show" defaultValue={show} className={inputClass + " w-auto"}>
            <option value="">النشطون</option>
            <option value="missing">بلا سنة ميلاد</option>
            <option value="inactive">الموقوفون</option>
          </select>
        </label>
        <button className="h-11 rounded-md bg-ws-ink px-5 text-sm font-medium text-ws-paper">بحث</button>
      </form>

      <section className="flex flex-col gap-3">
        <p className="text-sm text-ws-muted tabular">
          {filtered.length.toLocaleString("en-US")} لاعب
          {filtered.length > PAGE ? ` — صفحة ${pageNumber} من ${Math.ceil(filtered.length / PAGE)}` : ""}
        </p>
        {shown.length === 0 ? (
          <p className="rounded-md border border-dashed border-ws-rule px-6 py-8 text-center text-ws-muted">
            {all.length === 0 ? "لا يوجد لاعبون بعد. استورد ملف اللاعبين من «استيراد البيانات»." : "لا نتائج."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-ws-rule bg-ws-raised">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-ws-sunk text-ws-muted">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">الرقم</th>
                  <th className="px-4 py-2.5 text-start font-medium">الاسم</th>
                  <th className="px-4 py-2.5 text-start font-medium">النادي</th>
                  <th className="px-4 py-2.5 text-start font-medium">النوع</th>
                  <th className="px-4 py-2.5 text-start font-medium">سنة الميلاد</th>
                  <th className="px-4 py-2.5 text-start font-medium">المرحلة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ws-rule">
                {shown.map((a) => {
                  const c = assignCategory(a.birthYear, SEASON_2026_2027)
                  return (
                    <tr key={a.id} className="hover:bg-ws-sunk">
                      <td className="px-4 py-2.5 tabular text-ws-muted">{a.federationNumber}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/dashboard/federation/athletes/${a.id}`} className="font-medium text-ws-ink hover:underline">
                          {a.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">{a.club ? <ClubBib code={a.club.code} name={a.club.nameAr} size="sm" /> : "—"}</td>
                      <td className="px-4 py-2.5 text-ws-soft">{a.gender === "F" ? "بنات" : "بنين"}</td>
                      <td className="px-4 py-2.5 tabular text-ws-soft">{a.birthYear ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        {c.resolved ? c.category.nameAr : <StatusChip tone="stop">غير محددة</StatusChip>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > PAGE ? (
          <div className="flex gap-3 text-sm">
            {pageNumber > 1 ? <Link href={query({ page: String(pageNumber - 1) })}>← السابق</Link> : null}
            {pageNumber * PAGE < filtered.length ? <Link href={query({ page: String(pageNumber + 1) })}>التالي →</Link> : null}
          </div>
        ) : null}
      </section>

      {isAdmin ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-ws-ink">إضافة لاعب</h2>
          <AddAthleteForm clubs={CLUBS} nextNumber={nextNumber} />
        </section>
      ) : null}
    </div>
  )
}
