"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { ChevronRight, ChevronLeft, Calendar } from "lucide-react"
import { urlForImage } from "@/lib/sanity.client"
import { cn } from "@/lib/utils"

interface HeroSlide {
  _id: string
  title: string
  subtitle?: string
  image?: any
  date?: string
  category?: string
  link?: string
  ctaText?: string
  ctaLink?: string
}

interface HeroSectionProps {
  slides: HeroSlide[]
}

const primaryButton =
  "inline-flex items-center justify-center rounded-md bg-red-600 px-6 py-3 text-lg font-bold text-white transition-colors hover:bg-red-700"
const secondaryButton =
  "inline-flex items-center justify-center rounded-md border-2 border-white/70 px-6 py-3 text-lg font-bold text-white transition-colors hover:bg-white hover:text-gray-900"

// Sanity originals can be 5000px+ and several MB; ask the image CDN for a screen-sized copy.
function screenSized(url: string) {
  if (!url.startsWith("https://cdn.sanity.io/images/")) return url
  return `${url}${url.includes("?") ? "&" : "?"}w=1920&q=80&auto=format`
}

// The slide controls sit on the red start line at the bottom, one numbered tab per slide.
export default function HeroSection({ slides }: HeroSectionProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const count = slides?.length ?? 0

  useEffect(() => {
    if (count < 2) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % count)
    }, 6000)

    return () => clearInterval(timer)
  }, [count, currentSlide])

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % count)
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + count) % count)

  const slide = count > 0 ? slides[currentSlide] : null
  const imageUrl = slide?.image ? screenSized(urlForImage(slide.image).url()) : "/hero-1.png"
  const title = typeof slide?.title === "string" ? slide.title.trim() : ""
  const subtitle = typeof slide?.subtitle === "string" ? slide.subtitle.trim() : ""
  const ctaLink = slide?.ctaLink || slide?.link
  // Slides without a title are photo slides: keep the photo clear and only
  // shade the bottom edge where the controls sit.
  const photoOnly = Boolean(slide) && !title

  return (
    <section className="relative isolate overflow-hidden bg-gray-900 text-white">
      <Image
        key={imageUrl}
        src={imageUrl}
        alt=""
        fill
        priority
        className="-z-20 object-cover"
        unoptimized={imageUrl.includes("placeholder.svg")}
      />
      {photoOnly ? (
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent" />
      ) : (
        <div className="absolute inset-0 -z-10 bg-gradient-to-l from-gray-900/95 via-gray-900/70 to-gray-900/20" />
      )}

      <div className="container mx-auto flex min-h-[520px] flex-col justify-center px-4 pb-28 pt-16 md:min-h-[620px] lg:min-h-[680px]">
        {photoOnly ? (
          <h1 className="sr-only">الاتحاد المصري للتزلج</h1>
        ) : slide ? (
          <div className="max-w-3xl" aria-live="polite">
            {slide.category && (
              <span className="mb-5 inline-block rounded-sm bg-red-600 px-3 py-1 text-sm font-bold">{slide.category}</span>
            )}
            <h1 className="text-4xl font-black leading-[1.2] md:text-6xl lg:text-7xl">{title}</h1>
            {subtitle && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-gray-200 md:text-xl">{subtitle}</p>}
            {slide.date && (
              <p className="mt-5 flex items-center gap-2 text-lg text-gray-200">
                <Calendar className="h-5 w-5 text-red-400" aria-hidden />
                {new Date(slide.date).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            )}
            {ctaLink && (
              <div className="mt-8">
                <Link href={ctaLink} className={primaryButton}>
                  {slide.ctaText || "اقرأ المزيد"}
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl">
            <h1 className="text-5xl font-black leading-[1.15] md:text-7xl">الاتحاد المصري للتزلج</h1>
            <p className="mt-6 max-w-xl text-xl leading-relaxed text-gray-200 md:text-2xl">
              نطور رياضة التزلج في مصر ونصنع أبطال المستقبل
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/events" className={primaryButton}>
                الفعاليات القادمة
              </Link>
              <Link href="/disciplines" className={secondaryButton}>
                رياضاتنا
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Start line, with the slide controls standing on it */}
      <div className="absolute inset-x-0 bottom-0">
        {count > 1 && (
          <div className="container mx-auto flex items-center justify-between gap-4 px-4 pb-4">
            <div className="flex items-center" role="tablist" aria-label="الشرائح">
              {slides.map((s, index) => (
                <button
                  key={s._id}
                  role="tab"
                  aria-selected={index === currentSlide}
                  aria-label={`الشريحة ${index + 1}`}
                  onClick={() => setCurrentSlide(index)}
                  className="group flex h-10 items-center px-1"
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-all",
                      index === currentSlide ? "w-10 bg-red-600" : "w-5 bg-white/50 group-hover:bg-white/80",
                    )}
                  />
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button
                onClick={prevSlide}
                aria-label="الشريحة السابقة"
                className="flex h-10 w-10 items-center justify-center bg-white/10 hover:bg-white/20"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <button
                onClick={nextSlide}
                aria-label="الشريحة التالية"
                className="flex h-10 w-10 items-center justify-center bg-white/10 hover:bg-white/20"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
        <div className="h-1.5 bg-red-600" aria-hidden />
      </div>
    </section>
  )
}
