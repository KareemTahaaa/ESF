import { cn } from "@/lib/utils"

/**
 * A club's identity, drawn as a race bib: the club code is the "number",
 * with the four safety-pin holes a real bib is fastened by.
 * Used wherever an account or athlete is tied to a club.
 */
export function ClubBib({
  code,
  name,
  size = "md",
  className,
}: {
  code: string
  name?: string
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const box = {
    sm: "h-7 min-w-[3.25rem] px-2 text-[0.8rem]",
    md: "h-10 min-w-[4.5rem] px-3 text-base",
    lg: "h-16 min-w-[7rem] px-5 text-2xl",
  }[size]
  const hole = size === "lg" ? "size-1.5" : "size-1"
  // Literal class names: Tailwind cannot see classes assembled at runtime.
  const holes =
    size === "lg"
      ? ["top-2.5 left-2.5", "top-2.5 right-2.5", "bottom-2.5 left-2.5", "bottom-2.5 right-2.5"]
      : ["top-1.5 left-1.5", "top-1.5 right-1.5", "bottom-1.5 left-1.5", "bottom-1.5 right-1.5"]

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-[3px] border border-ws-rule bg-ws-raised font-semibold tracking-wide text-ws-ink tabular",
        "border-t-[3px] border-t-ws-red",
        box,
        className
      )}
      dir="ltr"
      title={name}
      aria-label={name ? `${name} (${code})` : code}
    >
      {holes.map((pos) => (
        <span key={pos} aria-hidden className={cn("absolute rounded-full bg-ws-rule", hole, pos)} />
      ))}
      {code}
    </span>
  )
}
