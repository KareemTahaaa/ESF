import { getAllSportDisciplines } from "@/lib/sanity.queries"
import PageHero from "@/components/site/page-hero"
import DisciplineCard, { type DisciplineCardProps } from "@/components/ui/discipline-card"

export const revalidate = 60

export default async function DisciplinesPage() {
  const disciplines: DisciplineCardProps['discipline'][] = await getAllSportDisciplines()

  return (
    <main className="min-h-screen bg-gray-100">
      <PageHero
        title="التخصصات الرياضية"
        description="تعرف على جميع التخصصات الرياضية التي يدعمها الاتحاد المصري لرياضات الانزلاق"
        breadcrumb={[{ href: "/", label: "الرئيسية" }]}
      />

      <section className="py-16">
        <div className="container mx-auto px-4">
          {disciplines && disciplines.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {disciplines.map((discipline) => (
                <DisciplineCard key={discipline._id} discipline={discipline} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">لا توجد تخصصات رياضية متاحة حالياً</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
