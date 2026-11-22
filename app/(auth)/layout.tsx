import type React from "react"
import Image from "next/image"
import Link from "next/link"

// Sign-in pages read the session on every request; never prerender them.
export const dynamic = "force-dynamic"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="esf-ws grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <main className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="inline-flex w-fit items-center gap-3 text-sm text-ws-muted hover:text-ws-ink">
          <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-auto" />
          <span>الاتحاد المصري للتزلج</span>
        </Link>
        <div className="flex flex-1 items-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>

      <aside aria-hidden className="relative hidden overflow-hidden bg-ws-asphalt text-ws-asphalt-ink lg:block">
        {/* The start line. */}
        <div className="absolute inset-x-0 bottom-[18%] h-[3px] bg-ws-red" />
        <div className="relative flex h-full flex-col justify-start p-12">
          <Image src="/logo-white.png" alt="" width={72} height={72} className="h-16 w-auto self-start" />
          <p className="mt-10 max-w-sm font-extrabold text-3xl leading-snug">منصة الأندية لسباقات السرعة</p>
          <p className="mt-4 max-w-sm leading-relaxed text-ws-asphalt-muted">
            سجّل لاعبي ناديك في سباقات الموسم قبل الموعد النهائي، وتابع حالة التسجيل وكشوف البداية والنتائج المعتمدة.
          </p>
        </div>
      </aside>
    </div>
  )
}
