"use client"

interface QuoteSectionProps {
  quote: {
    text: string
    author: string
  }
}

export default function QuoteSection({ quote }: QuoteSectionProps) {
  const quoteText = typeof quote?.text === "string" ? quote.text : ""
  const quoteAuthor = typeof quote?.author === "string" ? quote.author : ""

  if (!quoteText) return null

  return (
    <section className="bg-red-600 text-white">
      <div className="container mx-auto px-4 py-16 md:py-20">
        <figure className="max-w-4xl">
          <blockquote className="text-2xl font-black leading-[1.6] md:text-4xl md:leading-[1.5]">
            «{quoteText}»
          </blockquote>
          {quoteAuthor && (
            <figcaption className="mt-8 flex items-center gap-3 text-lg font-semibold text-red-50">
              <span className="h-0.5 w-10 bg-white" aria-hidden />
              {quoteAuthor}
            </figcaption>
          )}
        </figure>
      </div>
    </section>
  )
}
