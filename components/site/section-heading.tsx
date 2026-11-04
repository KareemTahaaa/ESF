import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

interface SectionHeadingProps {
  title: string
  description?: string
  href?: string
  linkLabel?: string
  tone?: "light" | "dark"
  className?: string
}

export default function SectionHeading({ title, description, href, linkLabel, tone = "light", className }: SectionHeadingProps) {
  const dark = tone === "dark"
  return (
    <div className={cn("mb-10 flex flex-wrap items-end justify-between gap-4", className)}>
      <div>
        <h2 className={cn("text-3xl font-black md:text-4xl", dark ? "text-white" : "text-gray-900")}>{title}</h2>
        <div className="mt-3 h-1 w-14 bg-red-600" aria-hidden />
        {description && (
          <p className={cn("mt-4 max-w-2xl leading-relaxed", dark ? "text-gray-300" : "text-gray-600")}>{description}</p>
        )}
      </div>
      {href && linkLabel && (
        <Link
          href={href}
          className={cn(
            "inline-flex items-center gap-1 font-bold",
            dark ? "text-white hover:text-red-300" : "text-red-600 hover:text-red-700",
          )}
        >
          {linkLabel}
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  )
}
