import { Mail, Phone, MapPin } from "lucide-react"
import Link from "next/link"

interface ContactSectionProps {
  contactInfo?: any
}

export default function ContactSection({ contactInfo }: ContactSectionProps) {
  const email = contactInfo?.email || "info@ensf.com"
  const phone = contactInfo?.phone || "+20 100 123 4567"
  const address = contactInfo?.address || "القاهرة، مصر"

  const items = [
    { Icon: Mail, label: "البريد الإلكتروني", value: <a href={`mailto:${email}`} dir="ltr" className="hover:text-red-600">{email}</a> },
    { Icon: Phone, label: "الهاتف", value: <a href={`tel:${phone}`} dir="ltr" className="hover:text-red-600">{phone}</a> },
    { Icon: MapPin, label: "العنوان", value: <span>{address}</span> },
  ]

  return (
    <section className="border-t border-gray-200 bg-white py-16 md:py-20">
      <div className="container mx-auto grid gap-10 px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center">
        <div>
          <h2 className="text-3xl font-black text-gray-900 md:text-4xl">تواصل معنا</h2>
          <div className="mt-3 h-1 w-14 bg-red-600" aria-hidden />
          <p className="mt-4 max-w-md leading-relaxed text-gray-600">نحن هنا للإجابة على استفساراتكم ومساعدتكم.</p>
          <Link
            href="/contact"
            className="mt-6 inline-flex rounded-md bg-red-600 px-5 py-2.5 font-bold text-white transition-colors hover:bg-red-700"
          >
            أرسل رسالة
          </Link>
        </div>

        <dl className="grid divide-y divide-gray-200 rounded-lg border border-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-x-reverse">
          {items.map(({ Icon, label, value }) => (
            <div key={label} className="flex flex-col gap-2 p-6">
              <Icon className="h-6 w-6 text-red-600" aria-hidden />
              <dt className="text-sm text-gray-500">{label}</dt>
              <dd className="break-words font-bold text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
