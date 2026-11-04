"use client"

import Link from "next/link"
import Image from "next/image"
import { useState } from "react"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface SportDiscipline {
  _id: string
  name: string
  slug: {
    current: string
  }
}

interface HeaderProps {
  disciplines: SportDiscipline[]
}

const NAV = [
  { href: "/", label: "الرئيسية" },
  { href: "/about", label: "من نحن" },
  { href: "/news", label: "الأخبار" },
  { href: "/events", label: "الفعاليات" },
  { href: "/results", label: "النتائج" },
  { href: "/disciplines", label: "الرياضات" },
  { href: "/regulations", label: "اللوائح" },
  { href: "/contact", label: "اتصل بنا" },
]

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
}

export default function Header({ disciplines }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const pathname = usePathname() ?? "/"

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen)

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="h-1 bg-red-600" aria-hidden />
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between gap-6 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <Image src="/logo.png" alt="" width={60} height={60} className="h-12 w-auto" />
            <span className="hidden text-sm font-bold leading-tight text-gray-900 xl:block">
              الاتحاد المصري
              <br />
              للتزلج
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="القائمة الرئيسية">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative px-3 py-2 font-semibold transition-colors",
                    active ? "text-red-600" : "text-gray-700 hover:text-gray-900",
                  )}
                >
                  {item.label}
                  {active && <span className="absolute inset-x-3 -bottom-[13px] h-[3px] bg-red-600" aria-hidden />}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleMenu}
              className="rounded-md p-2 text-gray-700 hover:bg-gray-100 lg:hidden"
              aria-expanded={isMenuOpen}
              aria-label={isMenuOpen ? "إغلاق القائمة" : "فتح القائمة"}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <nav className="border-t border-gray-200 pb-4 pt-2 lg:hidden" aria-label="القائمة الرئيسية">
            <div className="flex flex-col">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={toggleMenu}
                    className={cn(
                      "border-s-[3px] px-3 py-2.5 font-semibold",
                      active ? "border-red-600 bg-red-50 text-red-700" : "border-transparent text-gray-700",
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
              <Link
                href="/login"
                onClick={toggleMenu}
                className="mt-3 rounded-md bg-red-600 py-2.5 text-center font-bold text-white"
              >
                دخول الأندية
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}
