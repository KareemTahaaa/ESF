import type { Metadata } from "next"
import Link from "next/link"
import { ClubBib } from "@/components/workspace/bib"
import { StatusChip, type ChipTone } from "@/components/workspace/status-chip"
import { requireFederationAdmin } from "@/lib/auth/account"
import { CLUBS } from "@/lib/competition/clubs"
import { listClubAccounts } from "@/lib/workspace/data"
import type { AccountStatus } from "@/lib/auth/account"
import { ReviewPanel, SuspendForm } from "./review-panel"

export const metadata: Metadata = { title: "حسابات الأندية — الاتحاد المصري للتزلج" }

const TABS: { status: AccountStatus; label: string }[] = [
  { status: "pending", label: "بانتظار المراجعة" },
  { status: "approved", label: "مفعّلة" },
  { status: "rejected", label: "مرفوضة" },
  { status: "suspended", label: "موقوفة" },
]

const CHIP: Record<AccountStatus, { tone: ChipTone; label: string }> = {
  pending: { tone: "wait", label: "بانتظار المراجعة" },
  approved: { tone: "ok", label: "مفعّل" },
  rejected: { tone: "stop", label: "مرفوض" },
  suspended: { tone: "stop", label: "موقوف" },
}

const dateFormat = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })

export default async function ClubAccountsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireFederationAdmin()
  const { status: requested } = await searchParams
  const status: AccountStatus = TABS.some((t) => t.status === requested) ? (requested as AccountStatus) : "pending"

  const accounts = await listClubAccounts()
  const shown = accounts.filter((a) => a.status === status)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">حسابات الأندية</h1>
        <p className="max-w-2xl leading-relaxed text-ws-muted">
          تنشئ الأندية حساباتها بنفسها. تحقّق من أن صاحب الطلب يمثّل النادي فعلاً قبل الموافقة، فالموافقة تتيح له رؤية
          لاعبي النادي وتسجيلهم في السباقات. يُسجَّل كل قرار في سجل التدقيق.
        </p>
      </header>

      <nav aria-label="تصفية الحسابات" className="flex gap-1 overflow-x-auto border-b border-ws-rule">
        {TABS.map((tab) => {
          const count = accounts.filter((a) => a.status === tab.status).length
          const active = tab.status === status
          return (
            <Link
              key={tab.status}
              href={`/dashboard/federation/accounts?status=${tab.status}`}
              aria-current={active ? "page" : undefined}
              className={
                "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm " +
                (active ? "border-ws-red font-medium text-ws-ink" : "border-transparent text-ws-muted hover:text-ws-ink")
              }
            >
              {tab.label}
              <span className="ms-2 text-ws-muted tabular">{count}</span>
            </Link>
          )
        })}
      </nav>

      {shown.length === 0 ? (
        <div className="rounded-md border border-dashed border-ws-rule px-6 py-12 text-center text-ws-muted">
          {status === "pending"
            ? "لا توجد طلبات جديدة. ستظهر هنا عندما ينشئ نادٍ حساباً من صفحة التسجيل."
            : "لا توجد حسابات في هذه الحالة."}
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {shown.map((request) => (
            <li key={request.id} className="flex flex-col gap-4 rounded-md border border-ws-rule bg-ws-raised p-5">
              <div className="flex flex-wrap items-start gap-4">
                {request.club ?? request.requestedClub ? (
                  <ClubBib
                    code={(request.club ?? request.requestedClub)!.code}
                    name={(request.club ?? request.requestedClub)!.nameAr}
                  />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-medium text-ws-ink">{request.fullName}</p>
                    <StatusChip tone={CHIP[request.status].tone}>{CHIP[request.status].label}</StatusChip>
                  </div>
                  <p className="text-sm text-ws-muted">
                    {request.position ?? "—"} ·{" "}
                    {request.club
                      ? request.club.nameAr
                      : request.requestedClub
                        ? `يطلب تمثيل ${request.requestedClub.nameAr}`
                        : "لم يحدد النادي"}
                  </p>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-ws-muted">البريد</dt>
                  <dd dir="ltr" className="text-end text-ws-ink">
                    {request.email}
                  </dd>
                  <dt className="text-ws-muted">الهاتف</dt>
                  <dd dir="ltr" className="text-end text-ws-ink tabular">
                    {request.phone ?? "—"}
                  </dd>
                  <dt className="text-ws-muted">تاريخ الطلب</dt>
                  <dd className="text-end text-ws-ink">{dateFormat.format(new Date(request.createdAt))}</dd>
                </dl>
              </div>

              {request.status === "rejected" && request.rejectionReason ? (
                <p className="text-sm text-ws-stop">سبب الرفض: {request.rejectionReason}</p>
              ) : null}

              {request.status === "approved" ? (
                <SuspendForm profileId={request.id} />
              ) : (
                <ReviewPanel
                  profileId={request.id}
                  requestedClubCode={(request.club ?? request.requestedClub)?.code}
                  clubs={CLUBS}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
