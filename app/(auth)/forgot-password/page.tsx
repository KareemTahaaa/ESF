import type { Metadata } from "next"
import Link from "next/link"
import { ForgotPasswordForm } from "./forgot-password-form"

export const metadata: Metadata = { title: "نسيت كلمة المرور — الاتحاد المصري للتزلج" }

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">نسيت كلمة المرور؟</h1>
        <p className="leading-relaxed text-ws-muted">
          اكتب البريد الذي سجّلت به، وسنرسل إليك رابطاً لتعيين كلمة مرور جديدة. الرابط صالح لمرة واحدة.
        </p>
      </header>

      {error === "expired" && (
        <div role="alert" className="rounded-md border border-ws-stop/30 bg-ws-stop-wash px-4 py-3 text-sm text-ws-stop">
          انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً.
        </div>
      )}

      <ForgotPasswordForm />

      <p className="text-center text-sm text-ws-muted">
        تذكّرت كلمة المرور؟{" "}
        <Link href="/login" className="font-medium text-ws-red underline-offset-4 hover:underline">
          سجّل الدخول
        </Link>
      </p>
    </div>
  )
}
