import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { beIN } from "./fonts"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { getSiteSettings } from "@/lib/sanity.queries"

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await getSiteSettings()

    return {
      title: settings?.siteName || "الاتحاد المصري للتزلج",
      description: settings?.siteDescription || "الموقع الرسمي للاتحاد المصري للتزلج",
      icons: {
        icon: settings?.favicon?.asset?.url || "/favicon.ico",
      },
      generator: 'v0.app',
    }
  } catch (error) {
    console.error("Error fetching site settings:", error)
    return {
      title: "الاتحاد المصري للتزلج",
      description: "الموقع الرسمي للاتحاد المصري للتزلج",
      icons: {
        icon: "/favicon.ico",
      },
      generator: 'v0.app',
    }
  }
}

// The public header and footer live in app/(site)/layout.tsx, so the
// federation and club workspace can use its own chrome.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl" className={cn(beIN.variable, "antialiased")} suppressHydrationWarning>
      <body className={cn("min-h-screen bg-background font-sans antialiased")}>
        <ThemeProvider attribute="class" defaultTheme="light">
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
