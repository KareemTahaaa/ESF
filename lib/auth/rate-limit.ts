/**
 * Attempt limits for the sign-in, sign-up and password-reset forms.
 *
 * Those forms call Supabase from this server, so Supabase's own per-IP limits
 * see every visitor as the same address: one person guessing passwords could
 * use up the allowance for everyone. These limits are applied first, per
 * visitor address and per email.
 *
 * The counters live in memory, so each server instance keeps its own and they
 * reset on deploy. That stops casual guessing; Supabase's CAPTCHA protection
 * (docs/phase-2/SUPABASE_SETUP.md) is the stronger defence.
 */

export interface RateLimitRule {
  /** Attempts allowed inside the window. */
  readonly limit: number
  readonly windowMs: number
}

export interface RateLimitResult {
  readonly allowed: boolean
  /** When the oldest counted attempt leaves the window; 0 when allowed. */
  readonly retryAfterMs: number
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number = Date.now
  ) {}

  /** Counts one attempt for every key; refused if any key is over its limit. */
  attempt(keys: readonly string[]): RateLimitResult {
    const t = this.now()
    const since = t - this.rule.windowMs
    let retryAfterMs = 0
    for (const key of keys) {
      const recent = (this.hits.get(key) ?? []).filter((h) => h > since)
      this.hits.set(key, recent)
      if (recent.length >= this.rule.limit) retryAfterMs = Math.max(retryAfterMs, recent[0]! + this.rule.windowMs - t)
    }
    if (retryAfterMs > 0) return { allowed: false, retryAfterMs }
    for (const key of keys) this.hits.get(key)!.push(t)
    this.prune(since)
    return { allowed: true, retryAfterMs: 0 }
  }

  /** Forgets a key, e.g. the email after a successful sign-in. */
  reset(key: string): void {
    this.hits.delete(key)
  }

  private prune(since: number): void {
    if (this.hits.size < 5000) return
    for (const [key, list] of this.hits) if (list.every((h) => h <= since)) this.hits.delete(key)
  }
}

/** The visitor's address as reported by the hosting proxy. */
export function clientAddress(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown"
}

const MINUTE = 60_000

/** 10 sign-in attempts per 15 minutes, per address and per email. */
export const signInLimiter = new RateLimiter({ limit: 10, windowMs: 15 * MINUTE })
/** 5 sign-ups per hour per address. */
export const signUpLimiter = new RateLimiter({ limit: 5, windowMs: 60 * MINUTE })
/** 5 reset emails per hour, per address and per email. */
export const resetLimiter = new RateLimiter({ limit: 5, windowMs: 60 * MINUTE })

export function tooManyAttemptsMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / MINUTE))
  return `محاولات كثيرة في وقت قصير. انتظر ${minutes} ${minutes === 1 ? "دقيقة" : minutes === 2 ? "دقيقتين" : minutes <= 10 ? "دقائق" : "دقيقة"} ثم حاول مرة أخرى.`
}
