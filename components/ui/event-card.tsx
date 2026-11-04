"use client"

import Image from "next/image"
import Link from "next/link"
import { MapPin } from "lucide-react"
import { urlForImage } from "@/lib/sanity.client"

export interface EventCardProps {
  event: {
    _id: string
    title: string
    mainImage: any
    startDate: string
    slug: { current: string }
    location?: string
    isRegistrationOpen?: boolean
    sportDisciplines?: Array<{
      title: string
      icon: any
    }>
  }
  showLocation?: boolean
  imageHeight?: string
  className?: string
}

export function EventDate({ date, className = "" }: { date: string; className?: string }) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  return (
    <div className={`flex w-16 flex-col items-center overflow-hidden rounded-md bg-white text-center shadow-sm ${className}`}>
      <span className="w-full bg-red-600 py-0.5 text-xs font-bold text-white">
        {d.toLocaleDateString("ar-EG", { month: "short" })}
      </span>
      <span className="py-1 text-2xl font-black leading-tight text-gray-900">
        {d.toLocaleDateString("ar-EG", { day: "numeric" })}
      </span>
    </div>
  )
}

export default function EventCard({ event, showLocation = true, imageHeight = "h-48 sm:h-56", className = "" }: EventCardProps) {
  const icon = event.sportDisciplines?.[0]?.icon
  return (
    <Link
      href={`/events/${event.slug.current}`}
      className={`group flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300 ${className}`}
    >
      <div className={`relative bg-gray-100 ${imageHeight}`}>
        <Image
          src={event.mainImage ? urlForImage(event.mainImage).url() : "/placeholder.svg?height=200&width=300"}
          alt=""
          fill
          className="object-cover"
        />
        <EventDate date={event.startDate} className="absolute start-3 top-3" />
        {icon && (
          <div className="absolute end-3 top-3 h-11 w-11 rounded-md bg-white p-1.5">
            <Image
              src={urlForImage(icon).url()}
              alt={event.sportDisciplines![0]!.title}
              width={32}
              height={32}
              className="h-full w-full object-contain"
            />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-lg font-extrabold leading-snug text-gray-900 group-hover:text-red-600">{event.title}</h3>
        {showLocation && event.location && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{event.location}</span>
          </p>
        )}
        <span className="mt-auto pt-4 font-bold text-red-600">
          {event.isRegistrationOpen ? "التسجيل مفتوح" : "عرض التفاصيل"}
        </span>
      </div>
    </Link>
  )
}
