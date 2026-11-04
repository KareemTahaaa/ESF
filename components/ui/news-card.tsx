import Image from "next/image"
import Link from "next/link"
import { Calendar } from "lucide-react"
import { formatDate } from "@/lib/utils"

interface NewsCardProps {
  news: {
    _id: string
    title: string
    slug: {
      current: string
    }
    excerpt?: string
    publishedAt: string
    mainImage?: {
      asset?: {
        _id?: string
        url?: string
      }
    }
    sportDisciplines?: Array<{
      _id: string
      title?: string
      name?: string
      slug: {
        current: string
      }
    }>
  }
  // Accepted for existing call sites; the card has one fixed layout.
  imageHeight?: string
  showDisciplineIcon?: boolean
  showDisciplineTitle?: boolean
}

export default function NewsCard({ news }: NewsCardProps) {
  const imageUrl = news.mainImage?.asset?.url || "/placeholder.svg?height=300&width=400"
  const excerpt = typeof news.excerpt === "string" ? news.excerpt : ""
  const discipline = news.sportDisciplines?.[0]
  const disciplineName = discipline?.title || discipline?.name

  return (
    <Link
      href={`/news/${news.slug.current}`}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300"
    >
      <div className="relative aspect-[16/10] bg-gray-100">
        <Image
          src={imageUrl}
          alt=""
          fill
          className="object-cover"
          unoptimized={imageUrl.includes("placeholder.svg")}
        />
        {disciplineName && (
          <span className="absolute start-3 top-3 rounded-sm bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
            {disciplineName}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-lg font-extrabold leading-snug text-gray-900 group-hover:text-red-600">
          {news.title}
        </h3>
        {excerpt && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600">{excerpt}</p>}
        <p className="mt-auto flex items-center gap-1.5 pt-4 text-sm text-gray-500">
          <Calendar className="h-4 w-4" aria-hidden />
          {formatDate(news.publishedAt)}
        </p>
      </div>
    </Link>
  )
}
