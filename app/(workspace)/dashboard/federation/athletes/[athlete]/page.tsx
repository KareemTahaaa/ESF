import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ClubBib } from "@/components/workspace/bib"
import { StatusChip } from "@/components/workspace/status-chip"
import { requireAccount } from "@/lib/auth/account"
import { CLUBS } from "@/lib/competition/clubs"
import { raceLabel } from "@/lib/competition/rounds"
import { assignCategory } from "@/lib/competition/rules/age-category"
import { eligibleRaces } from "@/lib/competition/rules/eligibility"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import type { RaceCode } from "@/lib/competition/rules/types"
import { getAthleteDetail } from "@/lib/workspace/athletes"
import { formatCairo } from "@/lib/workspace/time"
import { ActiveForm, EditAthleteForm, TransferForm } from "../forms"

export const metadata: Metadata = { title: "لاعب — الاتحاد المصري للتزلج" }

const ACTIONS: Record<string, string> = {
  "athlete.create": "إضافة",
  "athlete.update": "تعديل",
  "athlete.update_from_import": "تحديث من ملف",
  "athlete.transfer": "انتقال",
  "athlete.deactivate": "إيقاف",
  "athlete.activate": "إعادة تفعيل",
}

const categoryName = (id: string) => SEASON_2026_2027.categories.find((c) => c.id === id)?.nameAr ?? id

function describe(detail: Record<string, unknown>): string {
  const before = detail.before as Record<string, unknown> | undefined
  const after = detail.after as Record<string, unknown> | undefined
  const parts: string[] = []
  if (before && after) {
    for (const key of ["full_name_ar", "birth_year", "gender", "registration_number"]) {
      if (before[key] !== after[key] && key in after) parts.push(`${String(before[key] ?? "—")} ← ${String(after[key] ?? "—")}`)
    }
  }
  const source = String(detail.source ?? "")
  if (source.startsWith("club_request:")) parts.push("بطلب من النادي")
  if (detail.reason) parts.push(`السبب: ${String(detail.reason)}`)
  return parts.join(" · ")
}

export default async function AthletePage({ params }: { params: Promise<{ athlete: string }> }) {
  const account = await requireAccount()
  if (account.role === "club_admin") redirect("/dashboard/club")
  const { athlete: id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id) || account.isDemo) notFound()
  const a = await getAthleteDetail(id)
  if (!a) notFound()
  const isAdmin = account.role === "federation_admin"
  const category = assignCategory(a.birthYear, SEASON_2026_2027)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/dashboard/federation/athletes" className="text-sm text-ws-muted hover:text-ws-ink">
          ← اللاعبون
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          {a.club ? <ClubBib code={a.club.code} name={a.club.nameAr} size="lg" /> : null}
          <div className="flex flex-col gap-1">
            <h1 className="font-extrabold text-3xl text-ws-ink">{a.fullName}</h1>
            <p className="flex flex-wrap items-center gap-x-3 text-ws-muted">
              <span className="tabular">#{a.federationNumber}</span>
              <span>{a.club?.nameAr ?? "بلا نادٍ هذا الموسم"}</span>
              <span>{category.resolved ? category.category.nameAr : "المرحلة غير محددة"}</span>
              {!a.isActive ? <StatusChip tone="stop">موقوف</StatusChip> : null}
            </p>
          </div>
        </div>
        {category.resolved ? (
          <p dir="ltr" className="flex flex-wrap justify-end gap-1 text-xs">
            {eligibleRaces("national_league", category.category.id).map((r: RaceCode) => (
              <span key={r} className="rounded bg-ws-sunk px-1.5 py-0.5 text-ws-soft">
                {raceLabel(r, category.category.id)}
              </span>
            ))}
          </p>
        ) : null}
      </header>

      {isAdmin ? (
        <section className="flex flex-col gap-4 rounded-md border border-ws-rule bg-ws-raised p-5">
          <h2 className="font-semibold text-ws-ink">تعديل البيانات</h2>
          <EditAthleteForm
            athlete={a.id}
            record={{ fullName: a.fullName, birthYear: a.birthYear, gender: a.gender, registrationNumber: a.registrationNumber }}
          />
        </section>
      ) : null}

      {isAdmin ? (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-md border border-ws-rule bg-ws-raised p-5">
            <h2 className="font-semibold text-ws-ink">انتقال إلى نادٍ آخر</h2>
            <TransferForm athlete={a.id} clubs={CLUBS} current={a.club?.code ?? null} />
          </div>
          <div className="flex flex-col gap-4 rounded-md border border-ws-rule bg-ws-raised p-5">
            <h2 className="font-semibold text-ws-ink">حالة اللاعب</h2>
            <p className="text-sm text-ws-muted">
              اللاعب الموقوف يبقى في السجل بنتائجه، لكنه لا يظهر للأندية للتسجيل في السباقات.
            </p>
            <ActiveForm athlete={a.id} active={a.isActive} />
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-ws-ink">الأندية</h2>
          <ul className="divide-y divide-ws-rule rounded-md border border-ws-rule bg-ws-raised text-sm">
            {a.memberships.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-ws-ink">{m.club?.nameAr ?? "—"}</span>
                <span className="text-ws-muted tabular">
                  <bdi dir="ltr">{m.season}</bdi> · من {m.validFrom}
                  {m.validTo ? ` إلى ${m.validTo}` : " (حالي)"}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-ws-ink">السباقات المسجل بها</h2>
          {a.entries.length === 0 ? (
            <p className="text-sm text-ws-muted">لا يوجد.</p>
          ) : (
            <ul className="divide-y divide-ws-rule rounded-md border border-ws-rule bg-ws-raised text-sm">
              {a.entries.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-ws-ink">
                    {e.event} — {e.round} <bdi dir="ltr">{raceLabel(e.race as RaceCode)}</bdi>
                  </span>
                  <span className="text-ws-muted">
                    {categoryName(e.category)}
                    {e.status === "withdrawn" ? " · مسحوب" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-ws-ink">سجل التغييرات</h2>
        {a.history.length === 0 ? (
          <p className="text-sm text-ws-muted">لا توجد تغييرات مسجلة.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-ws-rule rounded-md border border-ws-rule bg-ws-raised text-sm">
            {a.history.map((h, i) => (
              <li key={i} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:gap-4">
                <span className="shrink-0 text-ws-muted sm:w-48">{formatCairo(h.at)}</span>
                <span className="shrink-0 font-medium text-ws-ink sm:w-28">{ACTIONS[h.action] ?? h.action}</span>
                <span className="text-ws-soft">{describe(h.detail)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
