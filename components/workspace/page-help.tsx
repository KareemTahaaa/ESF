"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { helpFor, type HelpAudience } from "@/lib/workspace/help"

/** "How does this page work?" — collapsed at the top of every workspace page that has a guide. */
export function PageHelp({ audience }: { audience: HelpAudience }) {
  const pathname = usePathname()
  const topic = helpFor(pathname, audience)
  if (!topic || topic.steps.length === 0) return null

  return (
    <details key={topic.id} className="group mb-8 rounded-md border border-ws-rule bg-ws-raised text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-ws-soft hover:text-ws-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ws-sunk text-xs font-bold text-ws-ink">
          ؟
        </span>
        <span className="flex-1">
          <span className="font-medium text-ws-ink">كيف تعمل هذه الصفحة؟</span>
          <span className="ms-2 hidden text-ws-muted sm:inline">{topic.summary}</span>
        </span>
        <span aria-hidden className="text-ws-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-ws-rule px-4 py-4 leading-relaxed">
        <p className="text-ws-soft sm:hidden">{topic.summary}</p>
        <ol className="flex list-decimal flex-col gap-2 ps-5 text-ws-soft marker:text-ws-muted">
          {topic.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {topic.tips?.map((tip) => (
          <p key={tip} className="rounded bg-ws-sunk px-3 py-2 text-ws-soft">
            {tip}
          </p>
        ))}
        <Link href="/dashboard/help" className="self-start text-ws-red underline-offset-4 hover:underline">
          الدليل الكامل
        </Link>
      </div>
    </details>
  )
}
