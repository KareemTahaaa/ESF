import type { Metadata } from "next"
import Link from "next/link"
import { requireAccount } from "@/lib/auth/account"
import { CHAMPIONSHIP_LABEL, listEvents } from "@/lib/workspace/competition"
import { redirect } from "next/navigation"
import { CreateEventForm } from "./forms"

export const metadata: Metadata = { title: "الفعاليات والسباقات — الاتحاد المصري للتزلج" }

const dateFormat = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

export default async function EventsPage() {
  const account = await requireAccount()
  if (account.role === "club_admin") redirect("/dashboard/club")
  const events = account.isDemo ? [] : await listEvents()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">الفعاليات والسباقات</h1>
        <p className="max-w-2xl leading-relaxed text-ws-muted">
          أنشئ فعالية لكل يوم سباقات، ثم اختر لها السباقات من جدول الموسم. كل سباق يُقسَّم تلقائياً إلى أدواره (مثل دور ال 24
          ونصف النهائي)، ولكل دور موعده وحالته. لا يبدأ دور قبل اعتماد نتائج الأدوار التي يعتمد عليها.
        </p>
      </header>

      {account.role === "federation_admin" ? <CreateEventForm /> : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ws-ink">الفعاليات</h2>
        {events.length === 0 ? (
          <p className="rounded-md border border-dashed border-ws-rule px-6 py-8 text-center text-ws-muted">لا توجد فعاليات بعد.</p>
        ) : (
          <ul className="divide-y divide-ws-rule rounded-md border border-ws-rule bg-ws-raised">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/dashboard/federation/events/${e.id}`} className="flex flex-col gap-1 px-5 py-3 hover:bg-ws-sunk sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ws-ink">{e.nameAr}</span>
                    <span className="text-sm text-ws-muted">
                      {CHAMPIONSHIP_LABEL[e.championship]}
                      {e.venueAr ? ` · ${e.venueAr}` : ""}
                      {e.eventDate ? ` · ${dateFormat.format(new Date(e.eventDate))}` : ""}
                    </span>
                  </span>
                  <span className="text-sm text-ws-muted tabular">{e.rounds} دور</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
