import Link from "next/link"
import { ClubBib } from "@/components/workspace/bib"
import { StatusChip } from "@/components/workspace/status-chip"
import { findClub } from "@/lib/competition/clubs"
import { raceLabel } from "@/lib/competition/rounds"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import type { CategoryId, Gender } from "@/lib/competition/rules/types"
import type { AthleteStanding, ChampionshipStandings, PlacingNote, RaceStanding } from "@/lib/competition/standings"
import { CHAMPIONSHIP_LABEL } from "@/lib/workspace/competition"
import { STANDINGS_CHAMPIONSHIPS, type StandingsChampionship } from "@/lib/workspace/standings"

const categoryName = (id: CategoryId) => SEASON_2026_2027.categories.find((c) => c.id === id)?.nameAr ?? id
const genderName = (g: Gender) => (g === "F" ? "بنات" : "بنين")
const clubName = (code: string) => findClub(code)?.nameAr ?? code

const NOTE: Record<PlacingNote, string> = {
  scored: "",
  outside_points: "خارج مراكز النقاط",
  below_minimum: "أقل من 3 لاعبين في المرحلة — بلا نقاط",
  did_not_finish: "لم يكمل (DNS / DNF / DQ)",
  out_before_final: "خرج قبل النهائي",
  level_b: "المستوى B",
}

/**
 * Season standings for one championship. Shared by the federation (approved
 * and published results, unpublished marked) and clubs (published only — Row
 * Level Security decides what reaches here).
 */
export function StandingsView({
  standings,
  championship,
  basePath,
  highlightClub,
  showUnpublished,
}: {
  standings: Record<StandingsChampionship, ChampionshipStandings>
  championship: StandingsChampionship
  basePath: string
  highlightClub?: string
  showUnpublished: boolean
}) {
  const s = standings[championship]
  const completed = s.races.filter((r) => r.complete)
  const pending = s.races.filter((r) => !r.complete)
  const groups = groupAthletes(s.athletes)
  const anyUnpublished = showUnpublished && completed.some((r) => r.unpublished)

  return (
    <div className="flex flex-col gap-10">
      <nav aria-label="البطولة" className="flex gap-1 border-b border-ws-rule">
        {STANDINGS_CHAMPIONSHIPS.map((c) => (
          <Link
            key={c}
            href={`${basePath}?c=${c}`}
            aria-current={c === championship ? "page" : undefined}
            className={
              "-mb-px border-b-2 px-4 py-2.5 text-sm " +
              (c === championship ? "border-ws-red font-medium text-ws-ink" : "border-transparent text-ws-muted hover:text-ws-ink")
            }
          >
            {CHAMPIONSHIP_LABEL[c]}
          </Link>
        ))}
      </nav>

      <dl className="grid grid-cols-2 divide-ws-rule overflow-hidden rounded-md border border-ws-rule bg-ws-raised sm:grid-cols-3 sm:divide-x sm:divide-x-reverse">
        <Stat label="سباقات محسوبة" value={new Set(completed.map((r) => r.race)).size} />
        <Stat label="سباقات بانتظار النهائي" value={new Set(pending.map((r) => r.race)).size} />
        <Stat label="لاعبون لهم نقاط" value={s.athletes.length} />
      </dl>

      {anyUnpublished ? (
        <p className="rounded-md bg-ws-wait-wash px-4 py-3 text-sm leading-relaxed text-ws-wait">
          بعض النتائج المحسوبة هنا معتمدة لكنها غير منشورة بعد (موسومة «غير منشور»). الأندية والجمهور لا يرونها حتى تُنشر.
        </p>
      ) : null}

      {completed.length === 0 ? (
        <p className="rounded-md border border-dashed border-ws-rule px-6 py-12 text-center leading-relaxed text-ws-muted">
          لا توجد نقاط بعد في {CHAMPIONSHIP_LABEL[championship]}. تُحسب النقاط تلقائياً لكل سباق عند اعتماد نتائج نهائيه
          {showUnpublished ? "" : " ونشرها"}.
        </p>
      ) : null}

      {s.clubs.some((c) => c.points > 0) ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ws-ink">ترتيب الأندية</h2>
          <div className="overflow-x-auto rounded-md border border-ws-rule bg-ws-raised">
            <table className="w-full min-w-[24rem] text-sm">
              <thead className="bg-ws-sunk text-ws-muted">
                <tr>
                  <th className="w-16 px-4 py-2.5 text-start font-medium">المركز</th>
                  <th className="px-4 py-2.5 text-start font-medium">النادي</th>
                  <th className="px-4 py-2.5 text-start font-medium">النقاط</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ws-rule">
                {s.clubs.map((c) => (
                  <tr key={c.clubId} className={c.clubId === highlightClub ? "bg-ws-red-wash" : undefined}>
                    <td className="px-4 py-2.5 font-semibold text-ws-ink tabular">
                      {c.rank}
                      {c.tied ? <span className="ms-1 text-xs font-normal text-ws-muted">مكرر</span> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-3">
                        <ClubBib code={c.clubId} name={clubName(c.clubId)} size="sm" />
                        <span className="text-ws-ink">{clubName(c.clubId)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-ws-ink tabular">{c.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {groups.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ws-ink">ترتيب اللاعبين</h2>
          <p className="text-sm text-ws-muted">مجموع نقاط كل لاعب في سباقات البطولة، لكل مرحلة عمرية ونوع. افتح أي لاعب لترى السباقات التي جاءت منها نقاطه.</p>
          {groups.map(({ key, categoryId, gender, athletes }) => (
            <details key={key} className="group rounded-md border border-ws-rule bg-ws-raised" open={groups.length <= 2}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="font-medium text-ws-ink">
                  {categoryName(categoryId)} — {genderName(gender)}
                </span>
                <span className="text-sm text-ws-muted tabular">{athletes.length} لاعب</span>
              </summary>
              <ol className="divide-y divide-ws-rule border-t border-ws-rule">
                {athletes.map((a) => (
                  <li key={a.athleteId} className={a.clubCode === highlightClub ? "bg-ws-red-wash" : undefined}>
                    <details className="px-4 py-2.5">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 text-sm [&::-webkit-details-marker]:hidden">
                        <span className="w-8 font-semibold text-ws-ink tabular">{a.rank}</span>
                        <span className="flex-1 text-ws-ink">
                          {a.fullName} <span className="text-ws-muted tabular">({a.federationNumber})</span>
                        </span>
                        <span className="text-ws-soft">{clubName(a.clubCode)}</span>
                        <span className="w-16 text-end font-semibold text-ws-ink tabular">{a.points}</span>
                      </summary>
                      <ul className="mt-2 flex flex-col gap-1 ps-12 text-sm text-ws-soft">
                        {a.contributions.map((c, i) => (
                          <li key={i} className="flex flex-wrap gap-x-3">
                            <bdi dir="ltr">{raceLabel(c.race)}</bdi>
                            <span>المركز {c.place}</span>
                            <span className="tabular">{c.points} نقطة</span>
                            {c.clubCode !== a.clubCode ? <span className="text-ws-muted">مع {clubName(c.clubCode)}</span> : null}
                            {showUnpublished && c.unpublished ? <StatusChip tone="wait">غير منشور</StatusChip> : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </section>
      ) : null}

      {s.races.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ws-ink">التصنيف النهائي لكل سباق</h2>
          <div className="flex flex-col gap-3">
            {[...completed, ...pending].map((r) => (
              <RaceCard key={`${r.race}-${r.eventNumber}`} race={r} highlightClub={highlightClub} showUnpublished={showUnpublished} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-ws-rule bg-ws-sunk p-5 text-sm leading-relaxed text-ws-soft">
        <p className="font-medium text-ws-ink">كيف تُحسب النقاط</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 ps-5">
          <li>جدول نقاط المادة 5 لكل مرحلة عمرية، للمراكز من 1 إلى 8، وبشرط 3 لاعبين على الأقل في المرحلة.</li>
          <li>سباقات الأدوار (100م، One Lap، 500م، 800/1000م): مراكز النهائي فقط (1–4؛ في 100م Final A للأول والثاني و Final B للثالث والرابع). 200م: نهائي الـ 12 مرتباً بالزمن. المسافات الطويلة: المراكز التي يسجلها الحكام.</li>
          <li>لا نقاط للمستوى B ولا لحالات DNS / DNF / DQ ولا لجولة التصفيات. المركز المشترك يأخذ نقاطه كاملة ويُتخطّى المركز التالي.</li>
          <li>نقاط الأندية = مجموع نقاط لاعبيها في البطولة، وتبقى النقاط للنادي الذي شارك اللاعب باسمه وقت السباق (المادة 8).</li>
        </ul>
        <p className="mt-2 text-xs text-ws-muted">
          محسوبة من النتائج المعتمدة فقط في كل مرة تُفتح هذه الصفحة، وفق لوائح الموسم <bdi dir="ltr">{s.rulesetVersion}</bdi>. تصحيح نتيجة يغيّر النقاط
          تلقائياً بعد إعادة اعتمادها.
        </p>
      </section>
    </div>
  )
}

function RaceCard({ race, highlightClub, showUnpublished }: { race: RaceStanding; highlightClub?: string; showUnpublished: boolean }) {
  const placed = race.placings.filter((p) => p.place !== null)
  const others = race.placings.length - placed.length
  return (
    <details className="rounded-md border border-ws-rule bg-ws-raised">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-ws-ink">
          <bdi dir="ltr">{raceLabel(race.race)}</bdi> — {categoryName(race.categoryId)} {genderName(race.gender)}
        </span>
        {race.complete ? <StatusChip tone="ok">محسوب</StatusChip> : <StatusChip tone="neutral">بانتظار النهائي</StatusChip>}
        {showUnpublished && race.unpublished ? <StatusChip tone="wait">غير منشور</StatusChip> : null}
        <span className="text-sm text-ws-muted tabular">{race.participants} لاعب</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-ws-rule px-4 py-3 text-sm">
        {placed.length > 0 ? (
          <table className="w-full">
            <tbody className="divide-y divide-ws-rule">
              {placed.map((p) => (
                <tr key={p.athleteId} className={p.clubCode === highlightClub ? "bg-ws-red-wash" : undefined}>
                  <td className="w-12 py-1.5 font-semibold text-ws-ink tabular">
                    {p.place}
                    {p.tied ? "=" : ""}
                  </td>
                  <td className="py-1.5 text-ws-ink">{p.fullName}</td>
                  <td className="py-1.5 text-ws-soft">{clubName(p.clubCode)}</td>
                  <td className="py-1.5 text-end tabular">
                    {p.points > 0 ? <span className="font-semibold text-ws-ink">{p.points}</span> : <span className="text-xs text-ws-muted">{NOTE[p.note]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-ws-muted">لم تُعتمد نتائج النهائي بعد.</p>
        )}
        {others > 0 ? <p className="text-xs text-ws-muted">{others} لاعب آخر شارك دون مركز في النهائي (خرج قبل النهائي، أو المستوى B، أو لم يكمل).</p> : null}
        {race.sources.length > 0 ? (
          <p className="text-xs text-ws-muted">
            من نتائج: {race.sources.map((src) => `${src.eventName}${showUnpublished && !src.published ? " (غير منشورة)" : ""}`).join("، ")}
          </p>
        ) : null}
      </div>
    </details>
  )
}

function groupAthletes(athletes: readonly AthleteStanding[]) {
  const groups: { key: string; categoryId: CategoryId; gender: Gender; athletes: AthleteStanding[] }[] = []
  for (const a of athletes) {
    const key = `${a.categoryId}|${a.gender}`
    const g = groups.find((x) => x.key === key)
    if (g) g.athletes.push(a)
    else groups.push({ key, categoryId: a.categoryId, gender: a.gender, athletes: [a] })
  }
  return groups
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 border-b border-ws-rule px-5 py-4 sm:border-b-0">
      <dt className="text-sm text-ws-muted">{label}</dt>
      <dd className="text-2xl font-semibold text-ws-ink tabular">{value}</dd>
    </div>
  )
}
