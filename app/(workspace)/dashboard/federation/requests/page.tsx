import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ClubBib } from "@/components/workspace/bib"
import { StatusChip } from "@/components/workspace/status-chip"
import { requireAccount } from "@/lib/auth/account"
import { listAthleteRequests, nextFederationNumber, type AthleteRequest, type RequestStatus } from "@/lib/workspace/athletes"
import { formatCairo } from "@/lib/workspace/time"
import { ReviewForm } from "./review-form"

export const metadata: Metadata = { title: "طلبات الأندية — الاتحاد المصري للتزلج" }

const TABS: { status: RequestStatus; label: string }[] = [
  { status: "pending", label: "بانتظار المراجعة" },
  { status: "approved", label: "تمت الموافقة" },
  { status: "rejected", label: "مرفوضة" },
  { status: "withdrawn", label: "سحبها النادي" },
]

const FIELD: Record<string, string> = {
  full_name_ar: "الاسم",
  birth_year: "سنة الميلاد",
  gender: "النوع",
  registration_number: "رقم التسجيل",
}

const show = (key: string, value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : key === "gender" ? (value === "F" ? "بنات" : "بنين") : String(value)

function Changes({ r }: { r: AthleteRequest }) {
  const current: Record<string, unknown> = r.athlete
    ? {
        full_name_ar: r.athlete.fullName,
        birth_year: r.athlete.birthYear,
        gender: r.athlete.gender,
        registration_number: r.athlete.registrationNumber,
      }
    : {}
  return (
    <table className="w-full max-w-xl text-sm">
      <thead className="text-ws-muted">
        <tr>
          <th className="py-1 text-start font-medium">الحقل</th>
          {r.kind === "correction" ? <th className="py-1 text-start font-medium">الحالي</th> : null}
          <th className="py-1 text-start font-medium">المقترح</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(r.proposed).map(([key, value]) => (
          <tr key={key}>
            <td className="py-1 text-ws-muted">{FIELD[key] ?? key}</td>
            {r.kind === "correction" ? <td className="py-1 text-ws-soft line-through decoration-ws-stop/50">{show(key, current[key])}</td> : null}
            <td className="py-1 font-medium text-ws-ink">{show(key, value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const account = await requireAccount()
  if (account.role === "club_admin") redirect("/dashboard/club")
  if (account.isDemo) return <p className="text-ws-muted">يحتاج إلى ربط قاعدة البيانات.</p>
  const { status: requested } = await searchParams
  const status: RequestStatus = TABS.some((t) => t.status === requested) ? (requested as RequestStatus) : "pending"
  const [requests, nextNumber] = await Promise.all([listAthleteRequests(status), nextFederationNumber()])
  const isAdmin = account.role === "federation_admin"

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">طلبات الأندية</h1>
        <p className="max-w-2xl leading-relaxed text-ws-muted">
          تقترح الأندية لاعبين جدداً أو تصحيحات لبيانات لاعبيها. لا يتغير سجل الاتحاد إلا بعد موافقتك، ويُحفظ كل قرار مع الطلب
          الذي سببه.
        </p>
      </header>

      <nav aria-label="تصفية الطلبات" className="flex gap-1 overflow-x-auto border-b border-ws-rule">
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            href={`/dashboard/federation/requests?status=${tab.status}`}
            aria-current={tab.status === status ? "page" : undefined}
            className={
              "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm " +
              (tab.status === status ? "border-ws-red font-medium text-ws-ink" : "border-transparent text-ws-muted hover:text-ws-ink")
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {requests.length === 0 ? (
        <p className="rounded-md border border-dashed border-ws-rule px-6 py-10 text-center text-ws-muted">لا توجد طلبات هنا.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-col gap-4 rounded-md border border-ws-rule bg-ws-raised p-5">
              <div className="flex flex-wrap items-center gap-3">
                {r.club ? <ClubBib code={r.club.code} name={r.club.nameAr} size="sm" /> : null}
                <p className="font-medium text-ws-ink">
                  {r.kind === "new_athlete" ? "لاعب جديد" : "تصحيح بيانات"}
                  {r.athlete ? (
                    <>
                      {" — "}
                      <Link href={`/dashboard/federation/athletes/${r.athlete.id}`} className="hover:underline">
                        {r.athlete.fullName} <span className="tabular text-ws-muted">#{r.athlete.federationNumber}</span>
                      </Link>
                    </>
                  ) : null}
                </p>
                <span className="text-sm text-ws-muted">{formatCairo(r.submittedAt)}</span>
                {r.status !== "pending" ? (
                  <StatusChip tone={r.status === "approved" ? "ok" : r.status === "rejected" ? "stop" : "neutral"}>
                    {TABS.find((t) => t.status === r.status)?.label}
                  </StatusChip>
                ) : null}
              </div>
              <Changes r={r} />
              {r.note ? <p className="text-sm text-ws-soft">ملاحظة النادي: {r.note}</p> : null}
              {r.reviewNote ? <p className="text-sm text-ws-soft">رد الاتحاد: {r.reviewNote}</p> : null}
              {isAdmin && r.status === "pending" ? (
                <ReviewForm
                  request={r.id}
                  kind={r.kind}
                  nextNumber={nextNumber}
                  values={{
                    fullName: r.proposed.full_name_ar ?? "",
                    birthYear: r.proposed.birth_year ?? null,
                    gender: r.proposed.gender ?? null,
                    registrationNumber: r.proposed.registration_number ?? null,
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
