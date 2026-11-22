import Link from "next/link"
import Image from "next/image"
import { Facebook, Globe, Instagram, Mail, MessageCircle, Phone, Youtube } from "lucide-react"
import { getSiteSettings, getSocialMediaLinks, getContactPageData } from "@/lib/sanity.queries"

export default async function Footer() {
  let settings = null
  let socialLinks = null

  try {
    const [settingsData, socialData, contactPageData] = await Promise.all([
      getSiteSettings(),
      getSocialMediaLinks(),
      getContactPageData()
    ])
    settings = {
      ...settingsData,
      contactInfo: {
        ...settingsData?.contactInfo,
        phone: contactPageData?.phone ? [{ number: contactPageData.phone }] : settingsData?.contactInfo?.phone,
        email: contactPageData?.email ? [{ address: contactPageData.email }] : settingsData?.contactInfo?.email,
        address: contactPageData?.address ? { street: contactPageData.address } : settingsData?.contactInfo?.address,
        whatsapp: contactPageData?.whatsapp ? [{ number: contactPageData.whatsapp }] : settingsData?.contactInfo?.whatsapp,
      }
    }
    socialLinks = socialData
  } catch (error) {
    console.error("Failed to fetch footer data:", error)
  }

  const phones: string[] =
    settings?.contactInfo?.phone?.length > 0 ? settings.contactInfo.phone.map((p: any) => p.number) : ["+20111111111"]
  const emails: string[] =
    settings?.contactInfo?.email?.length > 0 ? settings.contactInfo.email.map((e: any) => e.address) : ["info@ensf.com"]
  const whatsapps: string[] = settings?.contactInfo?.whatsapp?.map((w: any) => w.number) ?? []
  const address = settings?.contactInfo?.address
  const social = [
    { href: socialLinks?.facebook, label: "فيسبوك", Icon: Facebook },
    { href: socialLinks?.instagram, label: "انستجرام", Icon: Instagram },
    { href: socialLinks?.youtube, label: "يوتيوب", Icon: Youtube },
  ].filter((s) => Boolean(s.href))

  const columns = [
    {
      title: "الاتحاد",
      links: [
        { href: "/about", label: "من نحن" },
        { href: "/disciplines", label: "الرياضات" },
        { href: "/regulations", label: "اللوائح والقوانين" },
      ],
    },
    {
      title: "البطولات",
      links: [
        { href: "/events", label: "الفعاليات" },
        { href: "/results", label: "النتائج" },
        { href: "/news", label: "الأخبار" },
      ],
    },
    {
      title: "الأندية",
      links: [
        { href: "/login", label: "دخول الأندية" },
        { href: "/signup", label: "إنشاء حساب نادٍ" },
        { href: "/contact", label: "اتصل بنا" },
      ],
    },
  ]

  return (
    <footer className="relative bg-gray-900 text-gray-300">
      <div className="h-1 bg-red-600" aria-hidden />
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(3,minmax(0,1fr))_1.3fr]">
          <div className="flex flex-col gap-5">
            <Image
              src={settings?.logo?.dark?.asset?.url || "/logo-white.png"}
              alt="الاتحاد المصري للتزلج"
              width={120}
              height={60}
              className="h-16 w-auto self-start"
            />
            <address className="not-italic leading-relaxed text-gray-400">
              {address ? (
                <>
                  <p>{address.street}</p>
                  {(address.city || address.country) && (
                    <p>{[address.city, address.country].filter(Boolean).join("، ")}</p>
                  )}
                </>
              ) : (
                <>
                  <p>256A شارع الهرم</p>
                  <p>القاهرة، مصر</p>
                </>
              )}
            </address>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 font-bold text-white">{col.title}</h3>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="mb-4 font-bold text-white">تواصل معنا</h3>
            <ul className="space-y-2.5">
              {phones.map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
                  <span dir="ltr">{n}</span>
                </li>
              ))}
              {emails.map((e) => (
                <li key={e} className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
                  <span dir="ltr" className="break-all">{e}</span>
                </li>
              ))}
              {whatsapps.map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
                  <span dir="ltr">{n}</span>
                </li>
              ))}
              {settings?.contactInfo?.websiteInfo?.url && (
                <li className="flex items-center gap-2">
                  <Globe className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
                  <a href={settings.contactInfo.websiteInfo.url} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                    {settings.contactInfo.websiteInfo.label || "زيارة الموقع"}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col-reverse items-start justify-between gap-4 border-t border-gray-800 pt-6 text-sm text-gray-500 sm:flex-row sm:items-center">
          <p>
            © <bdi dir="ltr">{new Date().getFullYear()}</bdi> الاتحاد المصري للتزلج
          </p>
          {social.length > 0 && (
            <div className="flex gap-2">
              {social.map(({ href, label, Icon }) => (
                <Link
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-gray-700 p-2 text-gray-300 hover:border-red-600 hover:text-white"
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="sr-only">{label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  )
}
