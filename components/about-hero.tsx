import PageHero from "@/components/site/page-hero"

interface AboutHeroProps {
  title?: string
  description?: string
  image?: string
}

export default function AboutHero({ title, description, image }: AboutHeroProps) {
  return (
    <PageHero
      title={title || "من نحن"}
      description={description || "الاتحاد المصري لرياضات الانزلاق - رائدون في تطوير رياضة التزلج في مصر والمنطقة العربية"}
      image={image}
      breadcrumb={[{ href: "/", label: "الرئيسية" }]}
    />
  )
}
