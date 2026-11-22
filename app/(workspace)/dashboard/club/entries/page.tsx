import type { Metadata } from "next"
import { StatusChip } from "@/components/workspace/status-chip"
import { requireClubAdmin } from "@/lib/auth/account"
import { raceLabel } from "@/lib/competition/rounds"
import { assignCategory } from "@/lib/competition/rules/age-category"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import {
  CHAMPIONSHIP_LABEL,
  ROUND_STATUS_LABEL,
  ROUND_STATUS_TONE,
  listAthletes,
  listClubRounds,
  listEntries,
  listQualifiedClubAthletes,
} from "@/lib/workspace/competition"
import { formatCairo } from "@/lib/workspace/time"
import { EntryForm, WithdrawButton, type Candidate } from "./entry-forms"

export const metadata: Metadata = { title: "التسجيل في السباقات — الاتحاد المصري للتزلج" }

const categoryName = (id: string) => SEASON_2026_2027.categories.find((c) => c.id === id)?.nameAr ?? id

export default async function ClubEntriesPage() {
  const account = await requireClubAdmin()
  if (account.isDemo) {
    return <p className="text-ws-muted">صفحة التسجيل تحتاج إلى ربط قاعدة البيانات، وهي غير متاحة في وضع العرض.</p>
  }

  // Row Level Security limits all three to this club's own data.
  const [rounds, roster] = await Promise.all([listClubRounds(), listAthletes()])
  const [entries, qualified] = await Promise.all([
    listEntries(rounds.map((r) => r.id)),
    listQualifiedClubAthletes(rounds.filter((r) => r.qualifiedEntries && r.status === "registration_open").map((r) => r.id)),
  ])
  const now = Date.now()
  const missingBirthYear = roster.filter((a) => a.birthYear === null)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">التسجيل في السباقات</h1>
        <p className="max-w-2xl leading-relaxed text-ws-muted">
          اختر من لاعبي {account.club.nameAr} المسجلين في الاتحاد. يظهر لكل سباق اللاعبون المؤهلون لمرحلتهم العمرية فقط، ويمكن
          للاعب التسجيل في أكثر من مسافة. بعد الموعد النهائي يُغلق التسجيل والسحب، ويلزم التواصل مع الاتحاد لأي تعديل.
        </p>
      </header>

      {missingBirthYear.length > 0 ? (
        <p className="rounded-md border border-ws-stop/30 bg-ws-stop-wash px-4 py-3 text-sm text-ws-stop">
          {missingBirthYear.length} من لاعبي النادي بلا سنة ميلاد في سجل الاتحاد، فلا يمكن تسجيلهم في أي سباق حتى يستكمل
          الاتحاد بياناتهم: {missingBirthYear.map((a) => `${a.fullName} (${a.federationNumber})`).join("، ")}.
        </p>
      ) : null}

      {rounds.length === 0 ? (
        <p className="rounded-md border border-dashed border-ws-rule px-6 py-12 text-center text-ws-muted">
          لا توجد سباقات مفتوحة للتسجيل حالياً. ستظهر هنا عندما يفتح الاتحاد التسجيل مع الموعد النهائي.
        </p>
      ) : (
        rounds.map((round) => {
          const mine = entries.filter((e) => e.roundId === round.id)
          const entered = new Set(mine.map((e) => e.athleteId))
          const open =
            round.status === "registration_open" && round.registrationDeadline !== null && Date.parse(round.registrationDeadline) > now
          const candidates: Candidate[] = roster.flatMap((a) => {
            if (entered.has(a.id)) return []
            const assignment = assignCategory(a.birthYear, SEASON_2026_2027)
            if (!assignment.resolved) return []
            if (round.qualifiedEntries) {
              // Only athletes who raced in the Qualifications (Q12).
              if (!qualified.get(round.id)?.has(a.id)) return []
            } else if (!round.eligibleCategories.includes(assignment.category.id)) return []
            return [{ id: a.id, federationNumber: a.federationNumber, fullName: a.fullName, category: assignment.category.nameAr, gender: a.gender }]
          })
          return (
            <section key={round.id} className="flex flex-col gap-4 rounded-md border border-ws-rule bg-ws-raised p-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h2 className="text-lg font-semibold text-ws-ink">
                  {round.nameAr} <bdi dir="ltr">{raceLabel(round.race)}</bdi>
                </h2>
                <StatusChip tone={open ? "ok" : ROUND_STATUS_TONE[round.status]}>
                  {round.status === "registration_open" && !open ? "انتهى موعد التسجيل" : ROUND_STATUS_LABEL[round.status]}
                </StatusChip>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-ws-muted">الفعالية:</dt>
                  <dd className="text-ws-ink">
                    {round.event.nameAr} — {CHAMPIONSHIP_LABEL[round.event.championship]}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ws-muted">آخر موعد:</dt>
                  <dd className="font-medium text-ws-ink">{round.registrationDeadline ? formatCairo(round.registrationDeadline) : "—"}</dd>
                </div>
                {round.qualifiedEntries ? (
                  <p className="leading-relaxed text-ws-soft sm:col-span-2">
                    للاعبين الذين شاركوا في جولة التصفيات فقط. يدخل المستوى A المتأهلون المسجَّلون، وإذا لم يكتمل العدد يُرقّى أفضل
                    لاعبي المستوى B المسجَّلين حسب الزمن، ويخوض الباقون سباق المستوى B. سجّل كل لاعب تريد مشاركته.
                  </p>
                ) : (
                  <div className="flex gap-2 sm:col-span-2">
                    <dt className="shrink-0 text-ws-muted">المراحل المسموح لها:</dt>
                    <dd className="text-ws-soft">{round.eligibleCategories.map(categoryName).join("، ")}</dd>
                  </div>
                )}
              </dl>

              {mine.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium text-ws-ink">لاعبو النادي المسجلون ({mine.length})</h3>
                  <ul className="divide-y divide-ws-rule rounded-md border border-ws-rule">
                    {mine.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className="text-ws-muted tabular">{e.federationNumber}</span>
                        <span className="flex-1 text-ws-ink">{e.fullName}</span>
                        <span className="text-ws-soft">{categoryName(e.categoryId)}</span>
                        <span className="hidden text-xs text-ws-muted sm:inline">{formatCairo(e.submittedAt)}</span>
                        {open ? <WithdrawButton entry={e.id} /> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {open ? (
                candidates.length > 0 ? (
                  <EntryForm round={round.id} candidates={candidates} />
                ) : (
                  <p className="text-sm text-ws-muted">لا يوجد لاعبون مؤهلون آخرون في النادي لهذا السباق.</p>
                )
              ) : null}
            </section>
          )
        })
      )}
    </div>
  )
}
