import PageHero from "@/components/site/page-hero"

interface ContactHeroProps {
  data?: {
    title?: string
    subtitle?: string
    backgroundImage?: {
      asset?: {
        url: string
      }
    }
  }
}

export default function ContactHero({ data }: ContactHeroProps) {
  return (
    <PageHero
      title={data?.title || "اتصل بنا"}
      description={data?.subtitle || "نحن هنا للإجابة على استفساراتكم ومساعدتكم في كل ما يتعلق برياضة التزلج"}
      image={data?.backgroundImage?.asset?.url}
      breadcrumb={[{ href: "/", label: "الرئيسية" }]}
    />
  )
}
