import type React from "react"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ClubBib } from "@/components/workspace/bib"
import { WorkspaceNav, type NavItem } from "@/components/workspace/nav"
import { PageHelp } from "@/components/workspace/page-help"
import { requireAccount } from "@/lib/auth/account"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { countPendingRequests } from "@/lib/workspace/athletes"
import { listClubAccounts } from "@/lib/workspace/data"
import { signOut } from "../../(auth)/actions"

// Every workspace page checks the signed-in account on each request. Without
// this, a build made before the Supabase keys exist would prerender the pages
// and skip that check.
export const dynamic = "force-dynamic"

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const account = await requireAccount()
  if (account.status !== "approved") redirect("/pending")

  const isFederation = account.role !== "club_admin"
  const pending = account.role === "federation_admin" ? (await listClubAccounts()).filter((a) => a.status === "pending").length : 0
  const requests = isFederation && !account.isDemo && isSupabaseConfigured() ? await countPendingRequests() : 0

  const items: NavItem[] = isFederation
    ? [
        { href: "/dashboard/federation", label: "نظرة عامة" },
        ...(account.role === "federation_admin"
          ? [{ href: "/dashboard/federation/accounts", label: "حسابات الأندية", badge: pending }]
          : []),
        { href: "/dashboard/federation/athletes", label: "اللاعبون" },
        { href: "/dashboard/federation/requests", label: "طلبات الأندية", badge: requests },
        ...(account.role === "federation_admin" ? [{ href: "/dashboard/federation/import", label: "استيراد البيانات" }] : []),
        { href: "/dashboard/federation/events", label: "الفعاليات والسباقات" },
        { href: "/dashboard/federation/standings", label: "الترتيب والنقاط", soon: true },
        { href: "/dashboard/help", label: "دليل الاستخدام" },
      ]
    : [
        { href: "/dashboard/club", label: "نظرة عامة" },
        { href: "/dashboard/club/entries", label: "التسجيل في السباقات" },
        { href: "/dashboard/club/requests", label: "طلبات اللاعبين" },
        { href: "/dashboard/club/results", label: "النتائج المعتمدة", soon: true },
        { href: "/dashboard/help", label: "دليل الاستخدام" },
      ]

  return (
    <div className="esf-ws flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-6 bg-ws-asphalt p-4 text-ws-asphalt-ink lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:p-5">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo-white.png" alt="الاتحاد المصري للتزلج" width={40} height={40} className="h-9 w-auto" />
          <span className="text-sm leading-tight text-ws-asphalt-muted">
            منصة سباقات السرعة
            <br />
            <span className="text-ws-asphalt-ink">موسم <bdi dir="ltr">2026–2027</bdi></span>
          </span>
        </Link>

        <WorkspaceNav items={items} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-white/10 pt-4 lg:mt-auto lg:flex-col lg:items-stretch">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {account.club ? <ClubBib code={account.club.code} name={account.club.nameAr} size="sm" /> : null}
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{account.fullName}</p>
              <p className="truncate text-xs text-ws-asphalt-muted">
                {account.club ? account.club.nameAr : account.role === "federation_admin" ? "إدارة الاتحاد" : "مسؤول النتائج"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-ws-asphalt-muted">
            {account.isDemo ? null : (
              <Link href="/reset-password" className="underline-offset-4 hover:text-white hover:underline">
                تغيير كلمة المرور
              </Link>
            )}
            <form action={signOut}>
              <button className="underline-offset-4 hover:text-white hover:underline">تسجيل الخروج</button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {account.isDemo && (
          <div className="border-b border-ws-wait/30 bg-ws-wait-wash px-6 py-2.5 text-sm text-ws-wait">
            وضع العرض — بيانات توضيحية لمراجعة التصميم. لا يُحفظ أي إجراء حتى تُربط قاعدة البيانات.
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 lg:py-10">
          <PageHelp audience={isFederation ? "federation" : "club"} />
          {children}
        </main>
      </div>
    </div>
  )
}
