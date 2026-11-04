import { cn } from "@/lib/utils"

export type ChipTone = "ok" | "wait" | "stop" | "neutral"

const TONES: Record<ChipTone, string> = {
  ok: "bg-ws-ok-wash text-ws-ok",
  wait: "bg-ws-wait-wash text-ws-wait",
  stop: "bg-ws-stop-wash text-ws-stop",
  neutral: "bg-ws-sunk text-ws-muted",
}

export function StatusChip({ tone, children, className }: { tone: ChipTone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
