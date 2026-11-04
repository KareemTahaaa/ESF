import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentAccount, homeFor, safeNextPath } from "@/lib/auth/account"
import { isDemoMode } from "@/lib/supabase/config"
import { enterDemo } from "../actions"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "تسجيل الدخول — الاتحاد المصري للتزلج" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const account = await getCurrentAccount()
  if (account) redirect(homeFor(account))

  const { next, error } = await searchParams
  const demo = isDemoMode()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">تسجيل الدخول</h1>
        <p className="text-ws-muted">لمسؤولي الأندية وأعضاء الاتحاد.</p>
      </header>

      {error === "confirmation" && (
        <div role="alert" className="rounded-md border border-ws-stop/30 bg-ws-stop-wash px-4 py-3 text-sm text-ws-stop">
          انتهت صلاحية رابط التأكيد أو استُخدم من قبل. سجّل الدخول، وإن لم يكن البريد مؤكداً فأنشئ الحساب مرة أخرى.
        </div>
      )}

      <LoginForm next={safeNextPath(next) ?? undefined} />

      {demo && (
        <section className="flex flex-col gap-3 rounded-md border border-dashed border-ws-wait/50 bg-ws-wait-wash p-4">
          <p className="text-sm text-ws-wait">
            وضع العرض: قاعدة البيانات غير مربوطة بعد. اختر لوحة لمعاينة التصميم ببيانات توضيحية.
          </p>
          <form action={enterDemo} className="flex flex-wrap gap-2">
            {[
              ["federation", "لوحة الاتحاد"],
              ["club", "لوحة النادي"],
              ["pending", "حساب بانتظار الموافقة"],
            ].map(([role, label]) => (
              <button
                key={role}
                name="role"
                value={role}
                className="rounded-md border border-ws-rule bg-ws-raised px-3 py-2 text-sm font-medium text-ws-ink hover:border-ws-ink"
              >
                {label}
              </button>
            ))}
          </form>
        </section>
      )}
    </div>
  )
}
