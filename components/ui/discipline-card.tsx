"use client"

import Image from "next/image"
import Link from "next/link"
import { urlForImage } from "@/lib/sanity.client"

export interface DisciplineCardProps {
  discipline: {
    _id: string
    name: string
    title?: string
    description?: string
    slug: { current: string }
    image: any
    icon?: any
  }
  showDescription?: boolean
  imageHeight?: string
  className?: string
  iconSize?: {
    containerSize: string
    padding: string
    imageSize: number
  }
}

export default function DisciplineCard({
  discipline,
  showDescription = true,
  imageHeight = "h-72",
  className = "",
  iconSize = {
    containerSize: "w-14 h-14",
    padding: "p-2.5",
    imageSize: 40,
  },
}: DisciplineCardProps) {
  const name = discipline.name || discipline.title || ""
  const imageUrl =
    discipline.image?.asset?.url ||
    (discipline.image ? urlForImage(discipline.image).url() : null) ||
    "/placeholder.svg?height=300&width=500"
  const iconUrl = discipline.icon?.asset?.url || (discipline.icon ? urlForImage(discipline.icon).url() : null)
  const description = typeof discipline.description === "string" ? discipline.description : ""

  return (
    <Link
      href={`/disciplines/${discipline.slug.current}`}
      className={`group relative block overflow-hidden rounded-lg bg-gray-900 ${imageHeight} ${className}`}
    >
      <Image
        src={imageUrl}
        alt=""
        fill
        className="object-cover opacity-80 transition-opacity duration-300 group-hover:opacity-100"
        unoptimized={imageUrl.includes("placeholder.svg")}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/50 to-transparent" />
      {iconUrl && (
        <div className={`absolute start-4 top-4 rounded-md bg-white ${iconSize.padding} ${iconSize.containerSize}`}>
          <Image
            src={iconUrl}
            alt=""
            width={iconSize.imageSize}
            height={iconSize.imageSize}
            className="h-full w-full object-contain"
            unoptimized={iconUrl.includes("placeholder.svg")}
          />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <h3 className="text-2xl font-black">{name}</h3>
        {showDescription && description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-300">{description}</p>}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1 origin-right scale-x-0 bg-red-600 transition-transform duration-300 group-hover:scale-x-100 group-focus-visible:scale-x-100" />
    </Link>
  )
}
