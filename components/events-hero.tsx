import PageHero from "@/components/site/page-hero"

interface EventsHeroProps {
  title?: string
  description?: string
  image?: string
}

export default function EventsHero({ title = "الفعاليات", description, image }: EventsHeroProps) {
  return <PageHero title={title} description={description} image={image} breadcrumb={[{ href: "/", label: "الرئيسية" }]} />
}
