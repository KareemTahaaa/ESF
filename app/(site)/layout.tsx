import type React from "react"
import { getAllSportDisciplines } from "@/lib/sanity.queries"
import Header from "@/components/header"
import Footer from "@/components/footer"

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const disciplines = await getAllSportDisciplines()

  return (
    <>
      <Header disciplines={disciplines} />
      {children}
      <Footer />
    </>
  )
}
