import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { StatusChip } from "@/components/workspace/status-chip"
import { requireAccount } from "@/lib/auth/account"
import { roundOutcome, type QualificationLine } from "@/lib/competition/results"
import { raceLabel } from "@/lib/competition/rounds"
import { findRound } from "@/lib/competition/rules/progression"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import { formatTime } from "@/lib/competition/rules/time"
import { loadRoundResults, type ResultSetStatus } from "@/lib/workspace/results"
import { formatCairo } from "@/lib/workspace/time"
import { DecisionForm, ImportScoreSheetForm, ResultsEntryForm, type EntryHeat } from "./forms"

export const metadata: Metadata = { title: "النتائج — الاتحاد المصري للتزلج" }

const SET_STATUS: Record<ResultSetStatus, { tone: "ok" | "wait" | "stop" | "neutral"; label: string }> = {
  draft: { tone: "neutral", label: "مسودة" },
  submitted: { tone: "wait", label: "بانتظار الاعتماد" },
  approved: { tone: "ok", label: "معتمدة" },
  published: { tone: "ok", label: "معتمدة ومنشورة" },
  superseded: { tone: "neutral", label: "استُبدلت بتصحيح" },
}

const categoryName = (id: string) => SEASON_2026_2027.categories.find((c) => c.id === id)?.nameAr ?? id

export default async function RoundResultsPage({ params }: { params: Promise<{ round: string }> }) {
  const account = await requireAccount()
  if (account.role === "club_admin") redirect("/dashboard/club")
  const { round: id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id) || account.isDemo) notFound()
  const loaded = await loadRoundResults(id)
  if (!loaded) notFound()
  const { round, event, startList, resultSet, lines, history } = loaded
  const isAdmin = account.role === "federation_admin"
  const massStart = round.roundKey === "race"
  const editable = round.status === "start_list_published" && (!resultSet || resultSet.status === "draft")

  const heats: EntryHeat[] = (startList?.list.groups ?? []).flatMap((g) =>
    g.heats.map((h) => ({
      key: `${g.eventNumber}-${h.heatNumber ?? 0}`,
      title: `Event ${g.eventNumber} — ${categoryName(g.categoryId)} — ${g.gender === "F" ? "بنات" : "بنين"}${h.heatNumber !== null ? ` — Heat ${h.heatNumber}` : ""}`,
      rows: h.lanes.map((l) => {
        const line = lines.get(l.entrant.athleteId)
        return {
          athleteId: l.entrant.athleteId,
          lane: l.lane,
          federationNumber: l.entrant.federationNumber,
          fullName: l.entrant.fullName,
          clubName: l.entrant.clubName,
          status: line?.status ?? "ok",
          time: line?.timeCs != null ? formatTime(line.timeCs) : "",
          position: line?.position != null ? String(line.position) : "",
        }
      }),
    }))
  )

  // Rounds that send athletes on (not finals, level B or mass-start races).
  const sendsOn = !massStart && findRound(event.championship, round.race, round.roundKey).advance.kind !== "final"
  const qualificationLines: QualificationLine[] =
    sendsOn && startList
      ? startList.list.groups.flatMap((g) =>
          g.heats.flatMap((h) =>
            h.lanes.flatMap((l) => {
              const line = lines.get(l.entrant.athleteId)
              return line
                ? [{ athleteId: l.entrant.athleteId, eventNumber: g.eventNumber, heatNumber: h.heatNumber, status: line.status, timeCs: line.timeCs, position: line.position }]
                : []
            })
          )
        )
      : []
  const outcome = qualificationLines.length > 0 ? roundOutcome(event.championship, round.race, round.roundKey, qualificationLines) : null
  const names = new Map((startList?.list.groups ?? []).flatMap((g) => g.heats.flatMap((h) => h.lanes.map((l) => [l.entrant.athleteId, l.entrant] as const))))
  const approved = resultSet?.status === "approved" || resultSet?.status === "published"

  const decisions: ("approve" | "return" | "publish" | "correct")[] =
    resultSet?.status === "submitted" ? ["approve", "return"] : resultSet?.status === "approved" ? ["publish", "correct"] : resultSet?.status === "published" ? ["correct"] : []

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href={`/dashboard/federation/events/${event.id}`} className="text-sm text-ws-muted hover:text-ws-ink">
          ← {event.nameAr}
        </Link>
        <h1 className="font-extrabold text-3xl text-ws-ink">
          النتائج — {round.nameAr} <bdi dir="ltr">{raceLabel(round.race)}</bdi>
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {resultSet ? (
            <StatusChip tone={SET_STATUS[resultSet.status].tone}>
              {SET_STATUS[resultSet.status].label} — النسخة {resultSet.version}
            </StatusChip>
          ) : (
            <StatusChip tone="neutral">لم تُدخل بعد</StatusChip>
          )}
          {resultSet?.approvedAt ? <span className="text-sm text-ws-muted">اعتُمدت {formatCairo(resultSet.approvedAt)}</span> : null}
          {resultSet?.publishedAt ? <span className="text-sm text-ws-muted">نُشرت {formatCairo(resultSet.publishedAt)}</span> : null}
        </div>
        {resultSet?.correctionReason ? <p className="text-sm text-ws-wait">نسخة تصحيح: {resultSet.correctionReason}</p> : null}
      </header>

      {round.needsReview ? (
        <p className="rounded-md bg-ws-stop-wash px-4 py-3 text-sm text-ws-stop">هذا الدور يحتاج مراجعة: {round.reviewReason}</p>
      ) : null}

      {!startList ? (
        <p className="rounded-md border border-dashed border-ws-rule px-6 py-10 text-center text-ws-muted">
          تُدخل النتائج بعد نشر قائمة البدء الرسمية لهذا الدور.
        </p>
      ) : editable ? (
        <>
          <section className="flex flex-col gap-3 rounded-md border border-ws-rule bg-ws-raised p-5">
            <h2 className="font-semibold text-ws-ink">من ورقة التحكيم</h2>
            <p className="text-sm text-ws-muted">
              ارفع ورقة التحكيم التي نزّلتها من النظام بعد ملء عمودي الزمن والترتيب. تُطابق الصفوف برقم اللاعب (Bib)، ولا يُحفظ شيء إن
              نقص لاعب أو زاد.
            </p>
            <ImportScoreSheetForm round={round.id} />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold text-ws-ink">إدخال النتائج</h2>
            <p className="text-sm text-ws-muted">
              الزمن بصيغة <bdi dir="ltr">15.34</bdi> أو <bdi dir="ltr">1:50.50</bdi>. يُرفض الزمن الخارج عن المدى المعقول للمسافة بدلاً من حفظه.
              {massStart ? " في سباقات النقاط والإقصاء يكفي المركز." : ""}
            </p>
            <ResultsEntryForm round={round.id} heats={heats} massStart={massStart} />
          </section>
        </>
      ) : (
        <section className="flex flex-col gap-3">
          {heats.map((h) => (
            <div key={h.key} className="overflow-x-auto rounded-md border border-ws-rule bg-ws-raised">
              <p className="border-b border-ws-rule bg-ws-sunk px-4 py-2 text-sm font-medium text-ws-ink">
                <bdi dir="ltr">{h.title}</bdi>
              </p>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-ws-rule">
                  {h.rows.map((r) => (
                    <tr key={r.athleteId}>
                      <td className="px-3 py-1.5 tabular text-ws-muted">{r.lane}</td>
                      <td className="px-3 py-1.5 tabular">{r.federationNumber}</td>
                      <td className="px-3 py-1.5 text-ws-ink">{r.fullName}</td>
                      <td className="px-3 py-1.5 text-ws-soft">{r.clubName}</td>
                      <td className="px-3 py-1.5 tabular" dir="ltr">
                        {r.status === "ok" ? r.time || "—" : r.status.toUpperCase()}
                      </td>
                      <td className="px-3 py-1.5 tabular">{r.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      {isAdmin && decisions.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-md border border-ws-rule bg-ws-raised p-5">
          <h2 className="font-semibold text-ws-ink">المراجعة</h2>
          <p className="text-sm text-ws-muted">
            {resultSet?.status === "submitted"
              ? "راجع النتائج. الاعتماد يجعل الدور مكتملاً ويفتح الأدوار التي تعتمد عليه."
              : "تصحيح نتائج معتمدة يفتح نسخة جديدة، ويحتفظ بالنسخة الحالية، ويضع علامة مراجعة على أي دور لاحق بدأ منها."}
          </p>
          <DecisionForm round={round.id} options={decisions} />
        </section>
      ) : null}

      {outcome ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-ws-ink">المتأهلون {approved && outcome.official ? "" : "— معاينة غير رسمية"}</h2>
          {outcome.blockers.length > 0 ? (
            <ul className="rounded-md bg-ws-wait-wash px-4 py-3 text-sm text-ws-wait">
              {outcome.blockers.map((b, i) => (
                <li key={i}>
                  {b.openQuestion}: {b.detail} — التأهل الرسمي موقوف حتى يحدد الاتحاد القاعدة.
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            {outcome.groups.map((g) => (
              <div key={g.eventNumber} className="rounded-md border border-ws-rule bg-ws-raised p-4 text-sm">
                <p className="mb-2 font-medium text-ws-ink">
                  <bdi dir="ltr">Event {g.eventNumber}</bdi> — يتأهل {g.advancing.length}
                </p>
                <ol className="list-decimal ps-5 text-ws-soft">
                  {g.advancing.map((a) => (
                    <li key={a}>
                      {names.get(a)?.fullName} <span className="text-ws-muted">({names.get(a)?.clubName})</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {history.length > 1 ? (
        <section className="flex flex-col gap-2 text-sm">
          <h2 className="font-semibold text-ws-ink">النسخ</h2>
          <ul className="text-ws-soft">
            {history.map((h) => (
              <li key={h.version}>
                النسخة {h.version}: {SET_STATUS[h.status].label}
                {h.correctionReason ? ` — ${h.correctionReason}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
