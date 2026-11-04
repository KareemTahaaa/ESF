import type { Metadata } from "next"
import SectionHeading from "@/components/site/section-heading"
import HeroSectionContainer from "@/components/hero-section-container"
import CategoriesSectionContainer from "@/components/categories-section-container"
import QuoteSectionContainer from "@/components/quote-section-container"
import UpcomingEvents from "@/components/upcoming-events"
import NewsGrid from "@/components/news-grid"
import ContactSection from "@/components/contact-section"
import { getAllNews, getAllEvents, getContactPageData } from "@/lib/sanity.queries"
import { getHomePageMeta, getSiteSettings } from "@/lib/sanity.queries"

export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [pageMeta, siteSettings] = await Promise.all([getHomePageMeta(), getSiteSettings()])

    return {
      title: pageMeta?.metaTitle || siteSettings?.siteName || "الاتحاد المصري للتزلج",
      description: pageMeta?.metaDescription || siteSettings?.siteDescription || "الموقع الرسمي للاتحاد المصري للتزلج",
    }
  } catch (error) {
    console.error("Error fetching page metadata:", error)
    return {
      title: "الاتحاد المصري للتزلج",
      description: "الموقع الرسمي للاتحاد المصري للتزلج",
    }
  }
}

export default async function Home() {
  let news = []
  let events = []
  let siteSettings = null
  let contactData = null

  try {
    const [newsData, eventsData, settingsData, contactInfo] = await Promise.all([
      getAllNews(),
      getAllEvents(),
      getSiteSettings(),
      getContactPageData(),
    ])
    news = newsData
    events = eventsData
    siteSettings = settingsData
    contactData = contactInfo
  } catch (error) {
    console.error("Error fetching data:", error)
  }

  const latestNews = news.slice(0, 6)
  const upcomingEvents = events.slice(0, 4)

  return (
    <main className="min-h-screen bg-gray-100">
      <HeroSectionContainer />
      <CategoriesSectionContainer />
      <QuoteSectionContainer />

      <section className="bg-gray-100 py-16 md:py-20">
        <div className="container mx-auto px-4">
          <SectionHeading title="آخر الأخبار" href="/news" linkLabel="كل الأخبار" />
          <NewsGrid news={latestNews} />
        </div>
      </section>

      <UpcomingEvents events={upcomingEvents} />

      <ContactSection contactInfo={{ phone: contactData?.phone, email: contactData?.email, address: contactData?.address }} />
    </main>
  )
}
