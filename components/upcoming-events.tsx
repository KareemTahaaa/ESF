import Image from "next/image"
import Link from "next/link"
import { MapPin } from "lucide-react"
import { urlForImage } from "@/lib/sanity.client"
import { EventDate } from "@/components/ui/event-card"
import SectionHeading from "@/components/site/section-heading"

interface Event {
  _id: string
  title: string
  slug: {
    current: string
  }
  startDate: string
  endDate?: string
  location: string
  excerpt?: string
  mainImage?: any
}

interface UpcomingEventsProps {
  events: Event[]
}

export default function UpcomingEvents({ events }: UpcomingEventsProps) {
  if (!events || events.length === 0) {
    return null
  }

  return (
    <section className="bg-gray-900 py-16 md:py-20">
      <div className="container mx-auto px-4">
        <SectionHeading title="الفعاليات القادمة" href="/events" linkLabel="كل الفعاليات" tone="dark" />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {events.map((event) => (
            <Link
              key={event._id}
              href={`/events/${event.slug.current}`}
              className="group flex flex-col overflow-hidden rounded-lg bg-gray-800 ring-1 ring-white/10 hover:ring-red-600"
            >
              <div className="relative h-44 bg-gray-700">
                <Image
                  src={event.mainImage ? urlForImage(event.mainImage).url() : "/placeholder.svg?height=200&width=400"}
                  alt=""
                  fill
                  className="object-cover"
                />
                <EventDate date={event.startDate} className="absolute start-3 top-3" />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="line-clamp-2 text-lg font-extrabold leading-snug text-white">{event.title}</h3>
                {event.location && (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-gray-400">
                    <MapPin className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
                    <span className="truncate">{event.location}</span>
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
