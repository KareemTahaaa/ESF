import PageHero from "@/components/site/page-hero"

interface RegulationsHeroProps {
  data?: {
    title: string
    subtitle?: string
    backgroundImage?: {
      asset: {
        url: string
      }
    }
  }
}

export default function RegulationsHero({ data }: RegulationsHeroProps) {
  return (
    <PageHero
      title={data?.title || "اللوائح والقوانين"}
      description={data?.subtitle || "جميع القوانين واللوائح المنظمة لأنشطة الاتحاد المصري لرياضات الانزلاق"}
      image={data?.backgroundImage?.asset?.url}
      breadcrumb={[{ href: "/", label: "الرئيسية" }]}
    />
  )
}
