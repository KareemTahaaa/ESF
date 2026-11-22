/**
 * Deadlines are entered and shown in Cairo time, whatever timezone the server
 * or the browser runs in. Egypt observes daylight saving time, so the offset is
 * looked up for the actual date rather than assumed.
 */

export const FEDERATION_TIME_ZONE = "Africa/Cairo"

function offsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FEDERATION_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** `2026-11-05T18:00` (a datetime-local value, Cairo wall time) -> ISO instant. Null if malformed. */
export function cairoLocalToIso(local: string): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number]
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  let utc = wall - offsetMs(wall)
  utc = wall - offsetMs(utc)
  const check = new Date(utc + offsetMs(utc))
  if (check.getUTCHours() !== h || check.getUTCMinutes() !== mi) return null // nonexistent DST wall time
  return new Date(utc).toISOString()
}

/** ISO instant -> datetime-local value in Cairo wall time. */
export function isoToCairoLocal(iso: string): string {
  const utc = new Date(iso).getTime()
  return new Date(utc + offsetMs(utc)).toISOString().slice(0, 16)
}

const display = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  timeZone: FEDERATION_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
})

export function formatCairo(iso: string): string {
  return display.format(new Date(iso))
}
