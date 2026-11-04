import { describe, expect, it } from "vitest"
import { cairoLocalToIso, isoToCairoLocal } from "../time"

describe("Cairo deadline conversion", () => {
  it("uses UTC+2 in winter", () => {
    expect(cairoLocalToIso("2026-11-05T18:00")).toBe("2026-11-05T16:00:00.000Z")
  })

  it("uses UTC+3 during Egyptian summer time", () => {
    expect(cairoLocalToIso("2026-07-01T18:00")).toBe("2026-07-01T15:00:00.000Z")
  })

  it("round-trips", () => {
    for (const v of ["2026-11-05T23:59", "2027-01-01T00:00", "2026-08-15T09:30"]) {
      expect(isoToCairoLocal(cairoLocalToIso(v)!)).toBe(v)
    }
  })

  it("rejects malformed input", () => {
    expect(cairoLocalToIso("05/11/2026 18:00")).toBeNull()
    expect(cairoLocalToIso("")).toBeNull()
  })
})
