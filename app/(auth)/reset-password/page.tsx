import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentAccount } from "@/lib/auth/account"
import { ResetPasswordForm } from "./reset-password-form"

export const metadata: Metadata = { title: "كلمة مرور جديدة — الاتحاد المصري للتزلج" }

/**
 * Reached from the emailed reset link (the callback signs the person in first)
 * or from "تغيير كلمة المرور" in the workspace. Either way a session is needed.
 */
export default async function ResetPasswordPage() {
  const account = await getCurrentAccount()
  if (!account || account.isDemo) redirect("/forgot-password?error=expired")

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">كلمة مرور جديدة</h1>
        <p className="leading-relaxed text-ws-muted">
          للحساب{" "}
          <bdi dir="ltr" className="font-medium text-ws-ink">
            {account.email}
          </bdi>
          . استخدم 10 أحرف على الأقل، ويُفضّل أن تجمع بين حروف وأرقام، ولا تستخدمها في موقع آخر.
        </p>
      </header>
      <ResetPasswordForm />
      <Link href="/dashboard" className="self-center text-sm text-ws-muted underline-offset-4 hover:text-ws-ink hover:underline">
        رجوع إلى المنصة دون تغيير
      </Link>
    </div>
  )
}
