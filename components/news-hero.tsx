import PageHero from "@/components/site/page-hero"

interface NewsHeroProps {
  title?: string
  description?: string
  backgroundImage?: string
}

export default function NewsHero({ title = "آخر الأخبار", description, backgroundImage }: NewsHeroProps) {
  return <PageHero title={title} description={description} image={backgroundImage} breadcrumb={[{ href: "/", label: "الرئيسية" }]} />
}
