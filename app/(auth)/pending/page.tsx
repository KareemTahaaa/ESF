import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ClubBib } from "@/components/workspace/bib"
import { StatusChip } from "@/components/workspace/status-chip"
import { homeFor, requireAccount } from "@/lib/auth/account"
import { signOut } from "../actions"

export const metadata: Metadata = { title: "حالة الحساب — الاتحاد المصري للتزلج" }

const STATUS = {
  pending: {
    tone: "wait",
    label: "بانتظار موافقة الاتحاد",
    body: "استلم الاتحاد طلبك. بعد التحقق من أنك تمثّل النادي سيُربط الحساب به، وتصلك رسالة على بريدك الإلكتروني.",
  },
  rejected: {
    tone: "stop",
    label: "لم تتم الموافقة على الطلب",
    body: "راجع سبب الرفض أدناه. إذا كان هناك خطأ، تواصل مع الاتحاد مباشرة لتصحيحه.",
  },
  suspended: {
    tone: "stop",
    label: "الحساب موقوف",
    body: "أوقف الاتحاد هذا الحساب مؤقتاً. تواصل مع الاتحاد لمعرفة السبب وإعادة التفعيل.",
  },
} as const

export default async function PendingPage() {
  const account = await requireAccount()
  if (account.status === "approved") redirect(homeFor(account))

  const status = STATUS[account.status]

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <StatusChip tone={status.tone} className="self-start">
          {status.label}
        </StatusChip>
        <h1 className="font-extrabold text-3xl text-ws-ink">مرحباً {account.fullName}</h1>
        <p className="leading-relaxed text-ws-soft">{status.body}</p>
      </header>

      <dl className="flex flex-col divide-y divide-ws-rule rounded-md border border-ws-rule bg-ws-raised">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-ws-muted">النادي المطلوب</dt>
          <dd className="flex items-center gap-3">
            {account.requestedClub ? (
              <>
                <span className="text-ws-ink">{account.requestedClub.nameAr}</span>
                <ClubBib code={account.requestedClub.code} size="sm" />
              </>
            ) : (
              <span className="text-ws-muted">يحدده الاتحاد عند المراجعة</span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-ws-muted">البريد الإلكتروني</dt>
          <dd dir="ltr" className="text-ws-ink">
            {account.email}
          </dd>
        </div>
        {account.status === "rejected" && account.rejectionReason && (
          <div className="flex flex-col gap-1 px-4 py-3">
            <dt className="text-sm text-ws-muted">سبب الرفض</dt>
            <dd className="text-ws-stop">{account.rejectionReason}</dd>
          </div>
        )}
      </dl>

      <form action={signOut}>
        <button className="text-sm font-medium text-ws-muted underline-offset-4 hover:text-ws-ink hover:underline">
          تسجيل الخروج
        </button>
      </form>
    </div>
  )
}
