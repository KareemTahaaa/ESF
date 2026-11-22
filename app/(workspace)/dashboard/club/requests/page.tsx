import type { Metadata } from "next"
import { StatusChip } from "@/components/workspace/status-chip"
import { requireClubAdmin } from "@/lib/auth/account"
import { listAthleteRequests, listRegistry } from "@/lib/workspace/athletes"
import { formatCairo } from "@/lib/workspace/time"
import { RequestForm, WithdrawRequest } from "./forms"

export const metadata: Metadata = { title: "طلبات اللاعبين — الاتحاد المصري للتزلج" }

const STATUS = {
  pending: { tone: "wait", label: "بانتظار الاتحاد" },
  approved: { tone: "ok", label: "تمت الموافقة" },
  rejected: { tone: "stop", label: "مرفوض" },
  withdrawn: { tone: "neutral", label: "مسحوب" },
} as const

const FIELD: Record<string, string> = { full_name_ar: "الاسم", birth_year: "سنة الميلاد", gender: "النوع", registration_number: "رقم التسجيل" }

export default async function ClubRequestsPage({ searchParams }: { searchParams: Promise<{ athlete?: string }> }) {
  const account = await requireClubAdmin()
  if (account.isDemo) return <p className="text-ws-muted">يحتاج إلى ربط قاعدة البيانات.</p>
  const { athlete } = await searchParams
  // Row Level Security returns this club's own athletes and requests only.
  const [roster, requests] = await Promise.all([listRegistry(), listAthleteRequests()])

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">طلبات اللاعبين</h1>
        <p className="max-w-2xl leading-relaxed text-ws-muted">
          سجل اللاعبين يديره الاتحاد. إن وجدت خطأ في بيانات لاعب من {account.club.nameAr}، أو لديك لاعب جديد، أرسل طلباً هنا.
          يطبّق الاتحاد التغيير بعد مراجعته، ويظهر لك قراره وسببه.
        </p>
      </header>

      <RequestForm
        roster={roster.filter((a) => a.isActive).map((a) => ({ id: a.id, federationNumber: a.federationNumber, fullName: a.fullName, birthYear: a.birthYear, gender: a.gender }))}
        preselected={athlete && roster.some((a) => a.id === athlete) ? athlete : undefined}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ws-ink">طلبات النادي</h2>
        {requests.length === 0 ? (
          <p className="rounded-md border border-dashed border-ws-rule px-6 py-8 text-center text-ws-muted">لم يُرسل أي طلب بعد.</p>
        ) : (
          <ul className="divide-y divide-ws-rule rounded-md border border-ws-rule bg-ws-raised">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-ws-ink">
                    {r.kind === "new_athlete" ? `لاعب جديد: ${r.proposed.full_name_ar ?? ""}` : `تصحيح: ${r.athlete?.fullName ?? ""}`}
                  </span>
                  <StatusChip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusChip>
                  <span className="text-xs text-ws-muted">{formatCairo(r.submittedAt)}</span>
                  {r.status === "pending" ? <WithdrawRequest request={r.id} /> : null}
                </div>
                <p className="text-sm text-ws-soft">
                  {Object.entries(r.proposed)
                    .map(([k, v]) => `${FIELD[k] ?? k}: ${k === "gender" ? (v === "F" ? "بنات" : "بنين") : String(v)}`)
                    .join(" · ")}
                </p>
                {r.reviewNote ? <p className="text-sm text-ws-soft">رد الاتحاد: {r.reviewNote}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
