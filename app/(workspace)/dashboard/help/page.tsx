import type { Metadata } from "next"
import Link from "next/link"
import { requireAccount } from "@/lib/auth/account"
import { ROUND_STATUS_LABEL, type RoundStatus } from "@/lib/workspace/competition"
import { FAQ, FEDERATION_SEASON_FLOW, HELP_TOPICS, type HelpAudience } from "@/lib/workspace/help"

export const metadata: Metadata = { title: "دليل الاستخدام — الاتحاد المصري للتزلج" }

const STATUS_MEANING: Record<RoundStatus, string> = {
  draft: "يجهّزه الاتحاد ولا تراه الأندية.",
  registration_open: "الأندية تسجّل لاعبيها حتى آخر موعد.",
  registration_closed: "انتهى التسجيل؛ القائمة قيد التجهيز.",
  start_list_published: "قائمة البدء نهائية ومتاحة للطباعة.",
  results_submitted: "النتائج أُدخلت وتنتظر اعتماد الاتحاد.",
  completed: "النتائج معتمدة؛ يُبنى منها الدور التالي.",
  cancelled: "أُلغي السباق.",
}

const CLUB_FLOW: readonly { title: string; href: string }[] = [
  { title: "راجع لاعبي ناديك وتأكد من صحة بياناتهم", href: "/dashboard/club" },
  { title: "أرسل طلب إضافة لاعب جديد أو تصحيح بيانات", href: "/dashboard/club/requests" },
  { title: "سجّل لاعبيك في السباقات المفتوحة قبل الموعد", href: "/dashboard/club/entries" },
  { title: "تابع قوائم البدء والنتائج المعتمدة التي ينشرها الاتحاد", href: "/dashboard/club/entries" },
]

export default async function HelpPage() {
  const account = await requireAccount()
  const audience: HelpAudience = account.role === "club_admin" ? "club" : "federation"
  const flow = audience === "club" ? CLUB_FLOW : FEDERATION_SEASON_FLOW
  const topics = HELP_TOPICS.filter((t) => t.audience === audience && t.steps.length > 0)
  const faq = FAQ.filter((f) => f.audience === "all" || f.audience === audience)

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">دليل الاستخدام</h1>
        <p className="max-w-2xl leading-relaxed text-ws-muted">
          {audience === "club"
            ? "كل ما يحتاجه مسؤول النادي لتسجيل لاعبيه ومتابعة السباقات."
            : "خطوات الموسم بالترتيب، وشرح كل صفحة في لوحة الاتحاد."}{" "}
          تجد أيضاً زر «كيف تعمل هذه الصفحة؟» أعلى كل صفحة.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-ws-ink">{audience === "club" ? "خطوات العمل" : "خطوات الموسم بالترتيب"}</h2>
        <ol className="flex flex-col divide-y divide-ws-rule rounded-md border border-ws-rule bg-ws-raised">
          {flow.map((step, i) => (
            <li key={step.title} className="flex items-center gap-4 px-5 py-3.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ws-ink text-sm font-semibold text-ws-paper tabular">
                {i + 1}
              </span>
              <span className="flex-1 text-ws-ink">{step.title}</span>
              <Link href={step.href} className="shrink-0 text-sm text-ws-red underline-offset-4 hover:underline">
                اذهب
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-ws-ink">شرح الصفحات</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {topics.map((topic) => (
            <article key={topic.id} className="flex flex-col gap-3 rounded-md border border-ws-rule bg-ws-raised p-5">
              <h3 className="font-semibold text-ws-ink">
                {topic.paths[0]!.includes("[id]") ? (
                  topic.title
                ) : (
                  <Link href={topic.paths[0]!} className="hover:underline">
                    {topic.title}
                  </Link>
                )}
              </h3>
              <p className="text-sm leading-relaxed text-ws-muted">{topic.summary}</p>
              <ol className="flex list-decimal flex-col gap-1.5 ps-5 text-sm leading-relaxed text-ws-soft marker:text-ws-muted">
                {topic.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {topic.tips?.map((tip) => (
                <p key={tip} className="rounded bg-ws-sunk px-3 py-2 text-sm leading-relaxed text-ws-soft">
                  {tip}
                </p>
              ))}
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-ws-ink">حالات السباق</h2>
        <dl className="grid gap-px overflow-hidden rounded-md border border-ws-rule bg-ws-rule sm:grid-cols-2">
          {(Object.keys(ROUND_STATUS_LABEL) as RoundStatus[]).map((status) => (
            <div key={status} className="flex flex-col gap-1 bg-ws-raised px-5 py-3">
              <dt className="font-medium text-ws-ink">{ROUND_STATUS_LABEL[status]}</dt>
              <dd className="text-sm text-ws-muted">{STATUS_MEANING[status]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-ws-ink">أسئلة شائعة</h2>
        <div className="flex flex-col divide-y divide-ws-rule rounded-md border border-ws-rule bg-ws-raised">
          {faq.map((item) => (
            <details key={item.q} className="group px-5 py-3.5">
              <summary className="cursor-pointer list-none font-medium text-ws-ink [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="me-2 inline-block text-ws-muted transition-transform group-open:rotate-90">
                  ‹
                </span>
                {item.q}
              </summary>
              <p className="mt-2 leading-relaxed text-ws-soft">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-ws-rule bg-ws-sunk p-5 text-sm leading-relaxed text-ws-soft">
        <p className="font-medium text-ws-ink">لم تجد إجابة؟</p>
        <p>
          {audience === "club" ? "تواصل مع سكرتارية الاتحاد" : "راسل الدعم الفني"} على{" "}
          <a href="mailto:Secretariat@egyptskate.org" dir="ltr" className="text-ws-red underline-offset-4 hover:underline">
            Secretariat@egyptskate.org
          </a>
          .
        </p>
      </section>
    </div>
  )
}
