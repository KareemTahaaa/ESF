"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import NewsCard from "@/components/ui/news-card"

interface NewsGridProps {
  news: any[] | null | undefined
}

export default function NewsGrid({ news }: NewsGridProps) {
  const newsItems = Array.isArray(news) ? news : []

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 6
  const totalPages = Math.ceil(newsItems.length / itemsPerPage)

  const startIndex = (currentPage - 1) * itemsPerPage
  const currentItems = newsItems.slice(startIndex, startIndex + itemsPerPage)

  if (newsItems.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-gray-600">لا توجد أخبار متاحة حالياً</p>
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {currentItems.map((item) => (
          <NewsCard
            key={item._id}
            news={item}
            imageHeight="h-48 sm:h-56 md:h-64"
            showDisciplineIcon={true}
            showDisciplineTitle={true}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-1" aria-label="صفحات الأخبار">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:border-gray-400 disabled:opacity-40"
            aria-label="الصفحة السابقة"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {Array.from({ length: totalPages }).map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentPage(index + 1)}
              aria-current={currentPage === index + 1 ? "page" : undefined}
              className={`h-10 min-w-10 rounded-md px-3 font-bold tabular-nums ${
                currentPage === index + 1 ? "bg-red-600 text-white" : "border border-gray-300 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              {index + 1}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:border-gray-400 disabled:opacity-40"
            aria-label="الصفحة التالية"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  )
}
