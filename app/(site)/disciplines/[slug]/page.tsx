import { notFound } from "next/navigation"
import Image from "next/image"
import { getSportDisciplineBySlug, getNewsByDiscipline, getEventsByDiscipline } from "@/lib/sanity.queries"
import { urlForImage } from "@/lib/sanity.client"
import PageHero from "@/components/site/page-hero"
import DisciplineNews from "@/components/discipline-news"
import DisciplineEvents from "@/components/discipline-events"

export default async function DisciplinePage({ params }: { params: { slug: string } }) {
  const { slug } = await params
  const discipline = await getSportDisciplineBySlug(slug)

  if (!discipline) {
    notFound()
  }

  const [news, events] = await Promise.all([getNewsByDiscipline(discipline._id), getEventsByDiscipline(discipline._id)])

  const imageUrl = discipline.image ? urlForImage(discipline.image).url() : "/placeholder.svg?height=400&width=1200"


  return (
    <main className="min-h-screen bg-gray-100">

      <PageHero
        title={discipline.name}
        description={typeof discipline.description === "string" ? discipline.description : undefined}
        image={imageUrl}
        breadcrumb={[
          { href: "/", label: "الرئيسية" },
          { href: "/disciplines", label: "الرياضات" },
        ]}
      >
        {discipline.icon && (
          <div className="relative mt-8 h-16 w-16 rounded-md bg-white">
            <Image src={urlForImage(discipline.icon).url()} alt="" fill className="object-contain p-2" />
          </div>
        )}
      </PageHero>

      {/* Content Sections */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <DisciplineNews news={news} disciplineName={discipline.name} />
          <DisciplineEvents events={events} disciplineName={discipline.name} />
        </div>
      </div>

    </main>
  )
}
