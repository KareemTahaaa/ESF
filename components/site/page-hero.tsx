import type React from "react"
import Image from "next/image"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

interface PageHeroProps {
  title: string
  description?: string
  image?: string
  /** Shown above the title; the page's own name is appended automatically. */
  breadcrumb?: Array<{ href: string; label: string }>
  children?: React.ReactNode
}

// Banner for every inner page: dark band, optional photo, and the red start line.
export default function PageHero({ title, description, image, breadcrumb, children }: PageHeroProps) {
  const hasImage = Boolean(image) && !image!.includes("placeholder")

  return (
    <section className="relative overflow-hidden bg-gray-900 text-white">
      {hasImage && (
        <>
          <Image src={image!} alt="" fill priority className="object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-l from-gray-900 via-gray-900/80 to-gray-900/30" />
        </>
      )}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-red-600" />

      <div className="container relative mx-auto px-4 pb-14 pt-12 md:pb-20 md:pt-16">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="مسار الصفحة" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-gray-400">
            {breadcrumb.map((item) => (
              <span key={item.href} className="flex items-center gap-1.5">
                <Link href={item.href} className="hover:text-white">
                  {item.label}
                </Link>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </span>
            ))}
            <span className="text-gray-200">{title}</span>
          </nav>
        )}
        <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-6xl">{title}</h1>
        {description && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-gray-300 md:text-xl">{description}</p>}
        {children}
      </div>
    </section>
  )
}
