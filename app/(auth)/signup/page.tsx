import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentAccount, homeFor } from "@/lib/auth/account"
import { CLUBS } from "@/lib/competition/clubs"
import { SignupForm } from "./signup-form"

export const metadata: Metadata = { title: "إنشاء حساب نادٍ — الاتحاد المصري للتزلج" }

export default async function SignupPage() {
  const account = await getCurrentAccount()
  if (account) redirect(homeFor(account))

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-extrabold text-3xl text-ws-ink">إنشاء حساب النادي</h1>
        <p className="leading-relaxed text-ws-muted">
          بعد إنشاء الحساب يراجعه الاتحاد ويربطه بناديك. لن تظهر بيانات لاعبي النادي إلا بعد الموافقة، حتى لا يتمكن أحد
          من التسجيل باسم نادٍ لا يمثّله.
        </p>
      </header>
      <SignupForm clubs={CLUBS} />
    </div>
  )
}
