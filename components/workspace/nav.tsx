"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export interface NavItem {
  readonly href: string
  readonly label: string
  readonly badge?: number
  /** Not built yet: shown so the roadmap is visible, but not clickable. */
  readonly soon?: boolean
}

export function WorkspaceNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname()

  return (
    <nav aria-label="أقسام المنصة" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {items.map((item) => {
        if (item.soon) {
          return (
            <span
              key={item.href}
              aria-disabled
              className="flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-ws-asphalt-muted/60"
            >
              {item.label}
              <span className="text-[0.7rem]">قريباً</span>
            </span>
          )
        }
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-white/10 font-medium text-white" : "text-ws-asphalt-ink/80 hover:bg-white/5 hover:text-white"
            )}
          >
            {item.label}
            {item.badge ? (
              <span className="min-w-5 rounded-full bg-ws-red px-1.5 text-center text-xs font-semibold text-white tabular">
                {item.badge}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
