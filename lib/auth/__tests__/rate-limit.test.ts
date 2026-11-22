import { describe, expect, it } from "vitest"
import { RateLimiter, clientAddress, tooManyAttemptsMessage } from "../rate-limit"

function limiter(limit = 3, windowMs = 1000) {
  let t = 0
  const l = new RateLimiter({ limit, windowMs }, () => t)
  return { l, at: (ms: number) => (t = ms) }
}

describe("RateLimiter", () => {
  it("allows up to the limit, then refuses until the oldest attempt leaves the window", () => {
    const { l, at } = limiter()
    at(0)
    expect(l.attempt(["a"]).allowed).toBe(true)
    at(100)
    expect(l.attempt(["a"]).allowed).toBe(true)
    at(200)
    expect(l.attempt(["a"]).allowed).toBe(true)
    at(300)
    expect(l.attempt(["a"])).toEqual({ allowed: false, retryAfterMs: 700 })
    at(1001)
    expect(l.attempt(["a"]).allowed).toBe(true)
  })

  it("refuses when any key is over, and a refused attempt counts against none", () => {
    const { l, at } = limiter(2)
    at(0)
    l.attempt(["ip", "x@a.org"])
    l.attempt(["ip", "y@a.org"])
    expect(l.attempt(["ip", "z@a.org"]).allowed).toBe(false)
    // z was never counted: from another address it still has its full allowance.
    expect(l.attempt(["ip2", "z@a.org"]).allowed).toBe(true)
    expect(l.attempt(["ip3", "z@a.org"]).allowed).toBe(true)
    expect(l.attempt(["ip4", "z@a.org"]).allowed).toBe(false)
  })

  it("reset forgets a key", () => {
    const { l } = limiter(1)
    l.attempt(["a"])
    expect(l.attempt(["a"]).allowed).toBe(false)
    l.reset("a")
    expect(l.attempt(["a"]).allowed).toBe(true)
  })
})

describe("clientAddress", () => {
  it("takes the first forwarded address", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4")
    expect(clientAddress(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8")
    expect(clientAddress(new Headers())).toBe("unknown")
  })
})

describe("tooManyAttemptsMessage", () => {
  it("rounds up to whole minutes", () => {
    expect(tooManyAttemptsMessage(1)).toContain("1 دقيقة")
    expect(tooManyAttemptsMessage(5 * 60_000)).toContain("5 دقائق")
    expect(tooManyAttemptsMessage(14.2 * 60_000)).toContain("15 دقيقة")
  })
})
