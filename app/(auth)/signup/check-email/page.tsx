import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "تأكيد البريد الإلكتروني — الاتحاد المصري للتزلج" }

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-extrabold text-3xl text-ws-ink">أكّد بريدك الإلكتروني</h1>
      <p className="leading-relaxed text-ws-soft">
        أرسلنا رابط التأكيد إلى{" "}
        {email ? (
          <span dir="ltr" className="font-medium text-ws-ink">
            {email}
          </span>
        ) : (
          "بريدك الإلكتروني"
        )}
        . افتح الرابط لإكمال إنشاء الحساب.
      </p>
      <ol className="flex flex-col gap-3 border-s-2 border-ws-rule ps-5 text-ws-soft">
        <li>تأكيد البريد الإلكتروني من الرابط المرسل.</li>
        <li>مراجعة الاتحاد للطلب وربط الحساب بالنادي.</li>
        <li>تصلك رسالة عند الموافقة، وتظهر لوحة النادي عند تسجيل الدخول.</li>
      </ol>
      <p className="text-sm text-ws-muted">
        لم تصلك الرسالة؟ تحقق من مجلد الرسائل غير المرغوب فيها، أو{" "}
        <Link href="/login" className="text-ws-red underline-offset-4 hover:underline">
          ارجع لتسجيل الدخول
        </Link>
        .
      </p>
    </div>
  )
}
