import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { ChipTone } from "@/components/workspace/status-chip"
import { requireAccount } from "@/lib/auth/account"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { countPendingRequests } from "@/lib/workspace/athletes"
import { getAthleteCounts, listEvents } from "@/lib/workspace/competition"
import { BLOCKED_RULES, RACE_CATALOGUE, SOURCE_AUDIT, getFederationOverview } from "@/lib/workspace/data"
import { listResultsAwaitingApproval } from "@/lib/workspace/results"

export const metadata: Metadata = { title: "لوحة الاتحاد — الاتحاد المصري للتزلج" }

const CHAMPIONSHIP_ORDER = ["qualifications", "national_league", "egypt_cup"] as const

export default async function FederationOverviewPage() {
  const account = await requireAccount()
  if (account.role === "club_admin") redirect("/dashboard/club")

  const live = !account.isDemo && isSupabaseConfigured()
  const [overview, awaiting, counts, events, requests] = await Promise.all([
    getFederationOverview(),
    live ? listResultsAwaitingApproval() : [],
    live ? getAthleteCounts() : null,
    live ? listEvents() : [],
    live ? countPendingRequests() : 0,
  ])
  // Before the database is connected (demo mode) the figures come from the audit of the Excel file.
  const athletes = counts?.athletes ?? SOURCE_AUDIT.athletes
  const missingBirthYear = counts?.missingBirthYear ?? SOURCE_AUDIT.missingBirthYears
  const rankingsNeedingReview = counts?.rankingsNeedingReview ?? SOURCE_AUDIT.rankingsNeedingReview
  const rounds = events.reduce((n, e) => n + e.rounds, 0)
  const hasAthletes = counts !== null && counts.athletes > 0

  const setup: { done: boolean; title: string; detail: string; href: string; action: string }[] = [
    {
      done: overview.accounts.approved > 0,
      title: "تفعيل حسابات الأندية",
      detail:
        overview.accounts.approved > 0
          ? `الحسابات المفعّلة: ${overview.accounts.approved} من ${overview.clubs} نادياً.`
          : "أرسل رابط إنشاء الحساب للأندية، ثم وافق على كل طلب واربطه بناديه.",
      href: "/dashboard/federation/accounts",
      action: "حسابات الأندية",
    },
    {
      done: hasAthletes,
      title: "إدخال اللاعبين",
      detail: hasAthletes
        ? `عدد اللاعبين في السجل: ${athletes.toLocaleString("en-US")}.`
        : "استورد ملف Excel الخاص بالاتحاد، أو أضف اللاعبين يدوياً.",
      href: hasAthletes ? "/dashboard/federation/athletes" : "/dashboard/federation/import",
      action: hasAthletes ? "اللاعبون" : "استيراد البيانات",
    },
    {
      done: events.length > 0,
      title: "إنشاء أول فعالية",
      detail: events.length > 0 ? `عدد الفعاليات: ${events.length}.` : "مثل الجولة الأولى من التصفيات: البطولة والمكان والتاريخ.",
      href: "/dashboard/federation/events",
      action: "الفعاليات",
    },
    {
      done: rounds > 0,
      title: "إضافة السباقات وفتح التسجيل",
      detail: rounds > 0 ? `عدد السباقات في الفعاليات: ${rounds}.` : "أضف سباقات الفعالية من جدول الموسم وحدد آخر موعد للتسجيل.",
      href: "/dashboard/federation/events",
      action: "الفعاليات",
    },
  ]
  const setupDone = setup.every((s) => s.done)

  const attention: { tone: ChipTone; title: string; detail: string; href?: string; action?: string }[] = [
    ...awaiting.map((r) => ({
      tone: "wait" as const,
      title: `نتائج بانتظار الاعتماد: ${r.label}`,
      detail: "لا تفتح الأدوار التالية ولا تُنشر النتائج قبل اعتمادها.",
      href: `/dashboard/federation/rounds/${r.roundId}/results`,
      action: "مراجعة النتائج",
    })),
    ...(overview.accounts.pending > 0
      ? [
          {
            tone: "wait" as const,
            title: `${overview.accounts.pending} طلب حساب نادٍ بانتظار المراجعة`,
            detail: "لا يرى صاحب الطلب أي بيانات للنادي حتى توافق عليه وتربطه بناديه.",
            href: "/dashboard/federation/accounts",
            action: "مراجعة الطلبات",
          },
        ]
      : []),
    ...(requests > 0
      ? [
          {
            tone: "wait" as const,
            title: `${requests} طلب لاعب من الأندية بانتظار المراجعة`,
            detail: "إضافة لاعبين جدد أو تصحيح بياناتهم.",
            href: "/dashboard/federation/requests",
            action: "طلبات الأندية",
          },
        ]
      : []),
    ...(missingBirthYear > 0
      ? [
          {
            tone: "stop" as const,
            title: `${missingBirthYear} لاعباً بلا سنة ميلاد`,
            detail: "لا يمكن تحديد مرحلتهم العمرية، فلن يظهروا مؤهلين لأي سباق حتى تُستكمل البيانات.",
            href: "/dashboard/federation/athletes",
            action: "اللاعبون",
          },
        ]
      : []),
    ...(rankingsNeedingReview > 0
      ? [
          {
            tone: "wait" as const,
            title: `${rankingsNeedingReview} ترتيباً من الموسم السابق يحتاج مراجعة`,
            detail: "لن يُستخدم في توزيع اللاعبين على الـ heats حتى يُصحَّح.",
          },
        ]
      : []),
    ...BLOCKED_RULES.map((rule) => ({
      tone: "neutral" as const,
      title: rule.text,
      detail: `يوقف النتائج الرسمية في: ${rule.affects} (${rule.id}).`,
    })),
  ]

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">نظرة عامة</h1>
        <p className="text-ws-muted">موسم سباقات السرعة <bdi dir="ltr">2026–2027</bdi></p>
      </header>

      <dl className="grid grid-cols-2 divide-ws-rule overflow-hidden rounded-md border border-ws-rule bg-ws-raised md:grid-cols-4 md:divide-x md:divide-x-reverse">
        <Stat label="أندية مسجلة" value={overview.clubs} />
        <Stat label="حسابات أندية مفعّلة" value={overview.accounts.approved} />
        <Stat label="لاعبون في السجل" value={athletes} note={counts ? undefined : "من ملف Excel — لم يُستورد بعد"} />
        <Stat label="فعاليات" value={events.length} />
      </dl>

      {setupDone ? null : (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-ws-ink">خطوات تجهيز الموسم</h2>
            <p className="text-sm text-ws-muted tabular">
              {setup.filter((s) => s.done).length} من {setup.length} مكتملة
            </p>
          </div>
          <ol className="flex flex-col divide-y divide-ws-rule rounded-md border border-ws-rule bg-ws-raised">
            {setup.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-5">
                <span
                  aria-hidden
                  className={
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular " +
                    (step.done ? "bg-ws-ok text-white" : "border border-ws-rule text-ws-muted")
                  }
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className={"font-medium " + (step.done ? "text-ws-muted" : "text-ws-ink")}>
                    {step.title}
                    <span className="sr-only">{step.done ? " — مكتملة" : " — لم تكتمل"}</span>
                  </p>
                  <p className="text-sm text-ws-muted">{step.detail}</p>
                </div>
                <Link
                  href={step.href}
                  className={
                    "shrink-0 self-start rounded-md px-4 py-2 text-sm font-medium sm:self-center " +
                    (step.done ? "text-ws-muted hover:text-ws-ink" : "bg-ws-ink text-ws-paper hover:opacity-90")
                  }
                >
                  {step.action}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-ws-ink">يحتاج إلى قرار</h2>
        <ul className="flex flex-col divide-y divide-ws-rule rounded-md border border-ws-rule bg-ws-raised">
          {attention.map((item) => (
            <li key={item.title} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
              <span
                aria-hidden
                className={
                  "hidden h-10 w-1 shrink-0 rounded-full sm:block " +
                  { stop: "bg-ws-stop", wait: "bg-ws-wait", ok: "bg-ws-ok", neutral: "bg-ws-rule" }[item.tone]
                }
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-medium text-ws-ink">{item.title}</p>
                <p className="text-sm leading-relaxed text-ws-muted">{item.detail}</p>
              </div>
              {item.href ? (
                <Link
                  href={item.href}
                  className="shrink-0 self-start rounded-md bg-ws-ink px-4 py-2 text-sm font-medium text-ws-paper hover:opacity-90 sm:self-center"
                >
                  {item.action}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
        {counts ? null : (
          <p className="text-xs text-ws-muted">
            أعداد اللاعبين وأخطاء البيانات من فحص ملف «{SOURCE_AUDIT.file}» بتاريخ <bdi dir="ltr">{SOURCE_AUDIT.checkedOn}</bdi>، قبل الاستيراد.
          </p>
        )}
      </section>

      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <h2 className="text-lg font-semibold text-ws-ink">
            <span aria-hidden className="me-2 inline-block text-ws-muted transition-transform group-open:-rotate-90">
              ‹
            </span>
            جدول سباقات الموسم <span className="text-ws-muted tabular">({overview.racesInCatalogue})</span>
          </h2>
          <p className="text-sm text-ws-muted">مرجع من ملف «Races 2026-2027.docx»</p>
        </summary>
        <div className="mt-4 flex flex-col gap-4">

        {CHAMPIONSHIP_ORDER.map((championship) => {
          const races = RACE_CATALOGUE.filter((r) => r.championship === championship)
          return (
            <div key={championship} className="overflow-x-auto rounded-md border border-ws-rule bg-ws-raised">
              <table className="w-full min-w-[38rem] text-sm">
                <caption className="border-b border-ws-rule px-4 py-3 text-start font-medium text-ws-ink">
                  {races[0]?.championshipAr}
                  <span className="ms-2 text-ws-muted tabular">({races.length})</span>
                </caption>
                <thead className="bg-ws-sunk text-ws-muted">
                  <tr>
                    <th className="w-10 px-4 py-2 text-start font-medium">#</th>
                    <th className="px-4 py-2 text-start font-medium">السباق</th>
                    <th className="px-4 py-2 text-start font-medium">النوع</th>
                    <th className="px-4 py-2 text-start font-medium">المكان</th>
                    <th className="px-4 py-2 text-start font-medium">التأهل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ws-rule">
                  {races.map((race) => (
                    <tr key={race.number} className="align-top">
                      <td className="px-4 py-3 text-ws-muted tabular">{race.number}</td>
                      <td className="px-4 py-3 font-medium text-ws-ink">{race.raceAr}</td>
                      <td className="px-4 py-3">
                        <span
                          dir="ltr"
                          className={
                            "inline-block rounded px-2 py-0.5 text-xs font-medium " +
                            (race.surface === "track" ? "bg-ws-red-wash text-ws-red" : "bg-ws-sunk text-ws-soft")
                          }
                        >
                          {race.surface === "track" ? "Track" : "Road"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ws-soft">{race.venueAr}</td>
                      <td className="max-w-xs px-4 py-3 leading-relaxed text-ws-soft">{race.ruleAr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
        </div>
      </details>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-ws-rule px-5 py-4 md:border-b-0 [&:nth-child(odd)]:border-e md:[&:nth-child(odd)]:border-e-0">
      <dt className="text-sm text-ws-muted">{label}</dt>
      <dd className="text-2xl font-semibold text-ws-ink tabular">{value.toLocaleString("en-US")}</dd>
      {note ? <dd className="text-xs text-ws-wait">{note}</dd> : null}
    </div>
  )
}
