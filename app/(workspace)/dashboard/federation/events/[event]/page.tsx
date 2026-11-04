import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ClubBib } from "@/components/workspace/bib"
import { StatusChip } from "@/components/workspace/status-chip"
import { requireAccount } from "@/lib/auth/account"
import { RACE_CATALOGUE_2026_2027, planRounds, raceLabel } from "@/lib/competition/rounds"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import { CHAMPIONSHIP_LABEL, ROUND_STATUS_LABEL, ROUND_STATUS_TONE, getEvent, listEntries, type RoundView } from "@/lib/workspace/competition"
import { formatCairo, isoToCairoLocal } from "@/lib/workspace/time"
import { AddRowForm, DeleteEventForm, ExceptionForm, ScheduleForm, StatusForm } from "../forms"

export const metadata: Metadata = { title: "فعالية — الاتحاد المصري للتزلج" }

const eventDateFormat = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

const categoryName = (id: string) => SEASON_2026_2027.categories.find((c) => c.id === id)?.nameAr ?? id

/**
 * Transitions offered here. Publishing a start list and approving results are
 * done from the start-list and results screens, where their checks run.
 */
function transitions(round: RoundView): { to: string; label: string; reopen?: boolean }[] {
  const t: { to: string; label: string; reopen?: boolean }[] = []
  if (round.status === "draft") {
    t.push(round.registers ? { to: "registration_open", label: "فتح التسجيل" } : { to: "registration_closed", label: "تفعيل الدور" })
  }
  if (round.status === "registration_open") t.push({ to: "registration_closed", label: "إغلاق التسجيل" })
  if (round.status === "registration_closed" && round.registers) {
    t.push({ to: "registration_open", label: "إعادة فتح التسجيل", reopen: true })
  }
  if (round.status !== "completed" && round.status !== "cancelled") t.push({ to: "cancelled", label: "إلغاء الدور" })
  return t
}

export default async function EventPage({ params }: { params: Promise<{ event: string }> }) {
  const account = await requireAccount()
  if (account.role === "club_admin") redirect("/dashboard/club")
  const { event: id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id) || account.isDemo) notFound()

  const found = await getEvent(id)
  if (!found) notFound()
  const { event, rounds } = found
  const isAdmin = account.role === "federation_admin"
  const entries = await listEntries(rounds.map((r) => r.id))

  const added = new Set(rounds.filter((r) => r.status !== "cancelled").map((r) => r.catalogueNumber))
  const available = RACE_CATALOGUE_2026_2027.filter((r) => r.championship === event.championship)
  const byRow = new Map<number, typeof rounds>()
  for (const r of rounds) byRow.set(r.catalogueNumber, [...(byRow.get(r.catalogueNumber) ?? []), r])

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/dashboard/federation/events" className="text-sm text-ws-muted hover:text-ws-ink">
          ← الفعاليات
        </Link>
        <h1 className="font-extrabold text-3xl text-ws-ink">{event.nameAr}</h1>
        <p className="text-ws-muted">
          {CHAMPIONSHIP_LABEL[event.championship]}
          {event.venueAr ? ` · ${event.venueAr}` : ""}
          {event.eventDate ? ` · ${eventDateFormat.format(new Date(event.eventDate))}` : null}
        </p>
      </header>

      {rounds.length === 0 ? (
        <p className="rounded-md border border-dashed border-ws-rule px-6 py-8 text-center text-ws-muted">
          لم يُضف أي سباق بعد. اختر السباقات من جدول الموسم بالأسفل.
        </p>
      ) : (
        [...byRow.entries()].map(([number, rowRounds]) => {
          const catalogue = RACE_CATALOGUE_2026_2027.find((r) => r.number === number)
          const plan = planRounds(number, SEASON_2026_2027)
          return (
            <section key={number} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold text-ws-ink">
                  <span className="text-ws-muted tabular">#{number}</span> {catalogue?.raceAr}
                </h2>
                <p className="text-sm text-ws-muted">{catalogue?.ruleAr}</p>
              </div>
              <ul className="flex flex-col gap-3">
                {rowRounds.map((round) => {
                  const spec = plan.find((p) => p.roundKey === round.roundKey)
                  const roundEntries = entries.filter((e) => e.roundId === round.id)
                  return (
                    <li key={round.id} className="flex flex-col gap-4 rounded-md border border-ws-rule bg-ws-raised p-5">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <p className="font-medium text-ws-ink">
                          {round.nameAr} <bdi dir="ltr" className="text-ws-muted">{raceLabel(round.race)}</bdi>
                        </p>
                        <StatusChip tone={ROUND_STATUS_TONE[round.status]}>{ROUND_STATUS_LABEL[round.status]}</StatusChip>
                        <span className="text-sm text-ws-muted">
                          {round.qualifiedEntries
                            ? "تسجيل الأندية للمتأهلين من التصفيات"
                            : round.entryMode === "registration"
                              ? "تسجيل الأندية"
                              : "التأهل من الأدوار السابقة"}
                        </span>
                        {round.registers ? (
                          <span className="text-sm text-ws-muted tabular">{round.activeEntries} مسجل</span>
                        ) : null}
                      </div>

                      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        {round.registers ? (
                          <div className="flex gap-2">
                            <dt className="text-ws-muted">آخر موعد للتسجيل:</dt>
                            <dd className="text-ws-ink">{round.registrationDeadline ? formatCairo(round.registrationDeadline) : "لم يُحدد"}</dd>
                          </div>
                        ) : null}
                        <div className="flex gap-2">
                          <dt className="text-ws-muted">موعد السباق:</dt>
                          <dd className="text-ws-ink">{round.scheduledAt ? formatCairo(round.scheduledAt) : "لم يُحدد"}</dd>
                        </div>
                        {round.eligibleCategories.length > 0 ? (
                          <div className="flex gap-2 sm:col-span-2">
                            <dt className="shrink-0 text-ws-muted">المراحل المسموح لها:</dt>
                            <dd className="text-ws-soft">{round.eligibleCategories.map(categoryName).join("، ")}</dd>
                          </div>
                        ) : null}
                      </dl>

                      {round.blockingPrerequisites.length > 0 ? (
                        <p className="rounded-md bg-ws-stop-wash px-4 py-2.5 text-sm text-ws-stop">
                          لا يمكن تفعيل هذا الدور قبل اعتماد نتائج: {round.blockingPrerequisites.join("؛ ")}
                        </p>
                      ) : null}
                      {spec?.blockedBy ? (
                        <p className="rounded-md bg-ws-wait-wash px-4 py-2.5 text-sm text-ws-wait">
                          توزيع هذا الدور غير مكتمل في ملف اللوائح ({spec.blockedBy.openQuestion})؛ لن تُصدر له قائمة بدء رسمية حتى يحدد الاتحاد القاعدة.
                        </p>
                      ) : null}
                      {round.qualifiedEntries ? (
                        <p className="rounded-md bg-ws-sunk px-4 py-2.5 text-sm leading-relaxed text-ws-soft">
                          تسجّل الأندية لاعبيها الذين شاركوا في التصفيات. يدخل المستوى A المتأهلون المسجَّلون فقط، وتُكمَّل الأماكن
                          الشاغرة بأفضل لاعبي المستوى B المسجَّلين حسب الزمن، ويخوض الباقون سباق المستوى B.
                        </p>
                      ) : null}

                      {isAdmin && round.status !== "completed" && round.status !== "cancelled" ? (
                        <div className="flex flex-col gap-4 border-t border-ws-rule pt-4">
                          {round.status === "draft" || round.status === "registration_open" || round.status === "registration_closed" ? (
                            <ScheduleForm
                              round={round.id}
                              deadline={round.registrationDeadline ? isoToCairoLocal(round.registrationDeadline) : null}
                              scheduled={round.scheduledAt ? isoToCairoLocal(round.scheduledAt) : null}
                            />
                          ) : null}
                          <StatusForm round={round.id} transitions={transitions(round)} />
                          {round.registers && (round.status === "registration_open" || round.status === "registration_closed") ? (
                            <ExceptionForm round={round.id} />
                          ) : null}
                        </div>
                      ) : null}

                      {round.needsReview ? (
                        <p className="rounded-md bg-ws-stop-wash px-4 py-2.5 text-sm text-ws-stop">يحتاج مراجعة: {round.reviewReason}</p>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {round.status !== "draft" || round.entryMode === "advancement" ? (
                          <Link
                            href={`/dashboard/federation/rounds/${round.id}`}
                            className="rounded-md border border-ws-rule px-3 py-1.5 text-sm text-ws-soft hover:bg-ws-sunk"
                          >
                            قائمة البدء
                          </Link>
                        ) : null}
                        {["start_list_published", "results_submitted", "completed"].includes(round.status) ? (
                          <Link
                            href={`/dashboard/federation/rounds/${round.id}/results`}
                            className="rounded-md border border-ws-rule px-3 py-1.5 text-sm text-ws-soft hover:bg-ws-sunk"
                          >
                            النتائج
                          </Link>
                        ) : null}
                      </div>

                      {roundEntries.length > 0 ? (
                        <details className="rounded-md bg-ws-sunk">
                          <summary className="cursor-pointer px-4 py-2.5 text-sm text-ws-soft">المسجلون ({roundEntries.length})</summary>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[36rem] text-sm">
                              <tbody className="divide-y divide-ws-rule">
                                {roundEntries.map((e) => (
                                  <tr key={e.id}>
                                    <td className="px-4 py-2 text-ws-muted tabular">{e.federationNumber}</td>
                                    <td className="px-4 py-2 text-ws-ink">{e.fullName}</td>
                                    <td className="px-4 py-2 text-ws-soft">{categoryName(e.categoryId)}</td>
                                    <td className="px-4 py-2">
                                      {e.club ? <ClubBib code={e.club.code} name={e.club.nameAr} size="sm" /> : null}
                                    </td>
                                    <td className="px-4 py-2 text-xs text-ws-wait">{e.exceptionReason ? `استثناء: ${e.exceptionReason}` : ""}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })
      )}

      {isAdmin ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-ws-ink">إضافة سباقات من جدول الموسم</h2>
          <div className="overflow-x-auto rounded-md border border-ws-rule bg-ws-raised">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-ws-sunk text-ws-muted">
                <tr>
                  <th className="w-10 px-4 py-2 text-start font-medium">#</th>
                  <th className="px-4 py-2 text-start font-medium">السباق</th>
                  <th className="px-4 py-2 text-start font-medium">الأدوار</th>
                  <th className="px-4 py-2 text-start font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ws-rule">
                {available.map((row) => {
                  const plan = planRounds(row.number, SEASON_2026_2027)
                  return (
                    <tr key={row.number} className="align-top">
                      <td className="px-4 py-3 text-ws-muted tabular">{row.number}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ws-ink">{row.raceAr}</p>
                        <p className="text-ws-muted">{row.venueAr}</p>
                      </td>
                      <td className="px-4 py-3 text-ws-soft">{plan.map((p) => p.nameAr).join(" · ")}</td>
                      <td className="px-4 py-3">
                        {added.has(row.number) ? (
                          <span className="text-ws-muted">مضاف</span>
                        ) : (
                          <AddRowForm event={event.id} number={row.number} longDistance={plan[0]?.roundKey === "race"} />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {isAdmin ? (
        <section className="flex flex-col gap-3 border-t border-ws-rule pt-6">
          <h2 className="text-lg font-semibold text-ws-ink">حذف الفعالية</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-ws-muted">
            للفعاليات التي أُنشئت بالخطأ أو للتجربة فقط، وقبل أي تسجيل أو قائمة بدء أو نتائج.
          </p>
          <DeleteEventForm
            event={event.id}
            name={event.nameAr}
            deletable={rounds.every(
              (r) => r.activeEntries === 0 && (r.status === "draft" || r.status === "registration_open" || r.status === "registration_closed")
            )}
          />
        </section>
      ) : null}
    </div>
  )
}
