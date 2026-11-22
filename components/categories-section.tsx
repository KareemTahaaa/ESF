"use client"

import DisciplineCard from "@/components/ui/discipline-card"
import SectionHeading from "@/components/site/section-heading"

interface CategoriesSectionProps {
  disciplines: any[]
}

export default function CategoriesSection({ disciplines }: CategoriesSectionProps) {
  const items = Array.isArray(disciplines) ? disciplines.slice(0, 5) : []

  return (
    <section className="bg-white py-16 md:py-20">
      <div className="container mx-auto px-4">
        <SectionHeading title="التخصصات الرياضية" href="/disciplines" linkLabel="كل الرياضات" />
        {items.length === 0 ? (
          <p className="text-gray-600">لا توجد تخصصات متاحة حالياً</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {items.map((discipline) => (
              <DisciplineCard
                key={discipline._id}
                discipline={discipline}
                showDescription={false}
                imageHeight="h-64 lg:h-80"
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
