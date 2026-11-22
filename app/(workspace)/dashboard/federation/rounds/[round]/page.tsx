import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { StatusChip } from "@/components/workspace/status-chip"
import { requireAccount } from "@/lib/auth/account"
import { raceLabel } from "@/lib/competition/rounds"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import type { StartList } from "@/lib/competition/start-list"
import { ROUND_STATUS_LABEL, ROUND_STATUS_TONE } from "@/lib/workspace/competition"
import { loadRoundStartList } from "@/lib/workspace/start-lists"
import { formatCairo } from "@/lib/workspace/time"
import { PublishForm } from "./publish-form"

export const metadata: Metadata = { title: "قائمة البدء — الاتحاد المصري للتزلج" }

const categoryName = (id: string) => SEASON_2026_2027.categories.find((c) => c.id === id)?.nameAr ?? id

function ListView({ list }: { list: StartList }) {
  if (list.groups.length === 0) return <p className="text-ws-muted">لا يوجد مسجلون.</p>
  return (
    <div className="flex flex-col gap-6">
      {list.groups.map((g) => (
        <section key={g.eventNumber} className="flex flex-col gap-2">
          <h3 className="font-semibold text-ws-ink">
            <bdi dir="ltr">Event {g.eventNumber}</bdi> — {categoryName(g.categoryId)} — {g.gender === "F" ? "بنات" : "بنين"}
            {g.mergedCategories.length > 1 ? (
              <span className="ms-2 text-sm font-normal text-ws-muted">(دمج {g.mergedCategories.map(categoryName).join(" و")})</span>
            ) : null}
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {g.heats.map((h, i) => (
              <div key={i} className="overflow-hidden rounded-md border border-ws-rule bg-ws-raised">
                {h.heatNumber !== null ? (
                  <p className="border-b border-ws-rule bg-ws-sunk px-4 py-2 text-sm font-medium text-ws-ink">
                    <bdi dir="ltr">Heat {h.heatNumber}</bdi>
                  </p>
                ) : null}
                <table className="w-full text-sm">
                  <thead className="text-ws-muted">
                    <tr>
                      <th className="px-3 py-1.5 text-start font-medium">{h.heatNumber === null ? "No." : "Lane"}</th>
                      <th className="px-3 py-1.5 text-start font-medium">Bib</th>
                      <th className="px-3 py-1.5 text-start font-medium">الاسم</th>
                      <th className="px-3 py-1.5 text-start font-medium">النادي</th>
                      <th className="px-3 py-1.5 text-start font-medium">التصنيف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ws-rule">
                    {h.lanes.map((l) => (
                      <tr key={l.entrant.athleteId}>
                        <td className="px-3 py-1.5 tabular text-ws-muted">{l.lane}</td>
                        <td className="px-3 py-1.5 tabular">{l.entrant.federationNumber}</td>
                        <td className="px-3 py-1.5 text-ws-ink">{l.entrant.fullName}</td>
                        <td className="px-3 py-1.5 text-ws-soft">{l.entrant.clubName}</td>
                        <td className="px-3 py-1.5 tabular text-ws-muted">{l.seed ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Blockers({ list }: { list: StartList }) {
  const notes = list.groups.flatMap((g) => g.flags.filter((f) => f.openQuestion === "Q5").map((f) => ({ g, f })))
  return (
    <>
      {list.blockers.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-md bg-ws-stop-wash px-4 py-3 text-sm text-ws-stop">
          {list.blockers.map((b, i) => (
            <li key={i}>
              لا يمكن النشر رسمياً ({b.openQuestion}): {b.detail}
            </li>
          ))}
        </ul>
      ) : null}
      {notes.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-md bg-ws-wait-wash px-4 py-3 text-sm text-ws-wait">
          {notes.map(({ g, f }, i) => (
            <li key={i}>
              <bdi dir="ltr">Event {g.eventNumber}</bdi>: {f.detail} (Q5)
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

export default async function RoundStartListPage({ params }: { params: Promise<{ round: string }> }) {
  const account = await requireAccount()
  if (account.role === "club_admin") redirect("/dashboard/club")
  const { round: id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id) || account.isDemo) notFound()

  const loaded = await loadRoundStartList(id)
  if (!loaded) notFound()
  const { round, event, preview, published, waitingFor } = loaded
  const fromResults = round.entryMode === "advancement"
  const q7 = preview?.groups.flatMap((g) => g.flags).filter((f) => f.openQuestion === "Q7").length ?? 0
  const exportBase = `/dashboard/federation/rounds/${round.id}/export`

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href={`/dashboard/federation/events/${event.id}`} className="text-sm text-ws-muted hover:text-ws-ink">
          ← {event.nameAr}
        </Link>
        <h1 className="font-extrabold text-3xl text-ws-ink">
          قائمة البدء — {round.nameAr} <bdi dir="ltr">{raceLabel(round.race)}</bdi>
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip tone={ROUND_STATUS_TONE[round.status]}>{ROUND_STATUS_LABEL[round.status]}</StatusChip>
          {round.scheduledAt ? <span className="text-sm text-ws-muted">{formatCairo(round.scheduledAt)}</span> : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        <a href={`${exportBase}?doc=start-list`} className="rounded-md border border-ws-rule bg-ws-raised px-4 py-2 text-sm text-ws-ink hover:bg-ws-sunk">
          تنزيل قائمة البدء (Excel)
        </a>
        <a href={`${exportBase}?doc=score-sheet`} className="rounded-md border border-ws-rule bg-ws-raised px-4 py-2 text-sm text-ws-ink hover:bg-ws-sunk">
          تنزيل ورقة التحكيم (Excel)
        </a>
        {published ? (
          <Link href={`/dashboard/federation/rounds/${round.id}/results`} className="rounded-md bg-ws-ink px-4 py-2 text-sm font-medium text-ws-paper hover:opacity-90">
            إدخال النتائج
          </Link>
        ) : null}
        <span className="self-center text-sm text-ws-muted">
          {published ? `النسخة الرسمية ${published.version}` : "قبل النشر يُنزَّل الملف بعلامة «مسودة»"}
        </span>
      </div>

      {round.needsReview ? (
        <p className="rounded-md bg-ws-stop-wash px-4 py-3 text-sm text-ws-stop">هذا الدور يحتاج مراجعة: {round.reviewReason}</p>
      ) : null}

      {published && fromResults && round.needsReview && round.status === "start_list_published" && preview ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-md border border-ws-rule bg-ws-raised p-5">
            <h2 className="font-semibold text-ws-ink">القائمة بعد تصحيح النتائج — معاينة</h2>
            <p className="text-sm leading-relaxed text-ws-soft">
              صُححت نتائج الدور السابق بعد نشر هذه القائمة. هذه القائمة مولّدة من النتائج المعتمدة الجديدة. نشرها يستبدل النسخة{" "}
              {published.version} ويرفع علامة المراجعة، ما دامت نتائج هذا الدور لم تُدخل بعد.
            </p>
            <Blockers list={preview} />
            {account.role === "federation_admin" && preview.official ? <PublishForm round={round.id} label="نشر القائمة المصححة" /> : null}
          </div>
          <ListView list={preview} />
        </section>
      ) : null}

      {published ? (
        <section className="flex flex-col gap-4">
          <p className="rounded-md bg-ws-ok-wash px-4 py-3 text-sm text-ws-ok">
            نُشرت النسخة {published.version} في {formatCairo(published.publishedAt)}. هذه القائمة الرسمية المحفوظة، ولا تتغير
            {fromResults ? " إلا بنشر نسخة جديدة." : " بتغير التسجيلات."}
          </p>
          <ListView list={published.list} />
        </section>
      ) : preview ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-md border border-ws-rule bg-ws-raised p-5">
            <h2 className="font-semibold text-ws-ink">معاينة — غير رسمية</h2>
            {fromResults ? (
              <p className="text-sm leading-relaxed text-ws-soft">
                مولّدة الآن من النتائج المعتمدة للدور السابق. المتأهلون ومن يذهب إلى المستوى B يُحددون بقاعدة السباق في جدول الموسم،
                والتوزيع على الـ heats يطابق جداول اللوائح (الأول مع السادس عشر، فائز Heat 1 مع فائز Heat 8 …)، دون أي قرعة.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-ws-soft">
                مولّدة الآن من التسجيلات الحالية. التوزيع حسب ترتيب اللاعب في نفس المسافة بالدوري العام للموسم السابق (المادة 9)،
                ومن لا ترتيب له يأتي في آخر التصنيف مرتباً برقمه في الاتحاد (Q7)، دون أي قرعة عشوائية.
              </p>
            )}
            {q7 > 0 ? <p className="text-sm text-ws-muted">{q7} مجموعة فيها لاعبون بلا ترتيب سابق.</p> : null}
            <Blockers list={preview} />
            {account.role === "federation_admin" && round.status === "registration_closed" && preview.official ? (
              <PublishForm round={round.id} />
            ) : round.status === "registration_open" ? (
              <p className="text-sm text-ws-wait">أغلق التسجيل أولاً من صفحة الفعالية، ثم انشر القائمة.</p>
            ) : round.status === "draft" ? (
              <p className="text-sm text-ws-wait">فعّل الدور أولاً من صفحة الفعالية، ثم انشر القائمة.</p>
            ) : null}
          </div>
          <ListView list={preview} />
        </section>
      ) : fromResults ? (
        <p className="rounded-md border border-dashed border-ws-rule px-6 py-10 text-center text-ws-muted">
          {waitingFor.length > 0
            ? `تُولَّد القائمة تلقائياً بعد اعتماد نتائج: ${waitingFor.join("؛ ")}.`
            : "لا يمكن توليد القائمة: هذا الدور غير مرتبط بدور سابق واحد."}
        </p>
      ) : (
        <p className="text-ws-muted">لا يوجد مسجلون.</p>
      )}
    </div>
  )
}
