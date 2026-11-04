/**
 * Legacy time-parsing tests.
 *
 * Every expected value below is taken from a real cell in the legacy `Records`
 * sheet. All 11 observed formats are covered, plus the misparse cases that the
 * plausibility bands exist to catch.
 */

import { describe, expect, it } from "vitest"
import { formatTime, parseLegacyTime, plausibleBandFor } from "../rules/time"
import type { RaceCode } from "../rules/types"

function cs(value: unknown, race: RaceCode): number | string {
  const result = parseLegacyTime(value, race)
  return result.ok ? result.centiseconds : `fail:${result.reason}`
}

describe("parseLegacyTime — all 11 legacy formats", () => {
  it("parses plain float seconds (992 rows)", () => {
    expect(cs(15.34, "100m")).toBe(1534)
    expect(cs(9.5, "100m")).toBe(950)
    expect(cs(22.94, "100m")).toBe(2294)
    expect(cs(43.65, "500m")).toBe(4365)
  })

  it("parses integer seconds (37 rows)", () => {
    expect(cs(48, "one_lap")).toBe(4800)
    expect(cs(53, "one_lap")).toBe(5300)
  })

  it("parses decimal-second strings with a leading space (1109 rows)", () => {
    expect(cs(" 15.34", "100m")).toBe(1534)
    expect(cs(" 15.47", "100m")).toBe(1547)
    expect(cs(" 16.18", "100m")).toBe(1618)
  })

  it("parses one-decimal-place strings (12 rows)", () => {
    expect(cs(" 16.8", "100m")).toBe(1680)
    expect(cs(" 17.9", "100m")).toBe(1790)
    expect(cs(" 18.0", "100m")).toBe(1800)
  })

  it("strips the Excel text-escape apostrophe (1 row)", () => {
    expect(cs("'14.11", "100m")).toBe(1411)
  })

  it("parses M:SS.hh colon format (201 rows)", () => {
    expect(cs(" 1:00.89", "one_lap")).toBe(6089)
    expect(cs(" 1:02.21", "one_lap")).toBe(6221)
    expect(cs(" 1:04.25", "one_lap")).toBe(6425)
  })

  it("parses M.SS.hh dot format (759 rows)", () => {
    // The trap: parseFloat("1.50.50") would yield 1.5.
    expect(cs("1.50.50", "middle")).toBe(11050)
    expect(cs("1.49.06", "middle")).toBe(10906)
    expect(cs("2.10.09", "middle")).toBe(13009)
  })

  it("treats a single trailing fraction digit as tenths (6 rows)", () => {
    // "2.52.5" is 2:52.50, not 2:52.05.
    expect(cs("2.52.5", "middle")).toBe(17250)
    expect(cs("1.11.3", "one_lap")).toBe(7130)
    expect(cs("1.01.2", "one_lap")).toBe(6120)
  })

  it("parses the comma minute separator (1 row)", () => {
    expect(cs("1,39.88", "middle")).toBe(9988)
  })

  it("parses Excel time serials as a fraction of a day (356 rows)", () => {
    // 0.000706018518... of a day = 61.00s, seen in the 500m pivot data.
    expect(cs(0.0007060185185185185, "500m")).toBe(6100)
    expect(cs(0.0011111111111111111, "middle")).toBe(9600)
    expect(cs(0.0006944444444444445, "500m")).toBe(6000)
  })

  it("parses Excel time objects", () => {
    // datetime.time(0, 1, 0, 910000) -> 1:00.91
    expect(cs({ hours: 0, minutes: 1, seconds: 0, microseconds: 910000 }, "500m")).toBe(6091)
    expect(cs({ hours: 0, minutes: 1, seconds: 5, microseconds: 170000 }, "500m")).toBe(6517)
    expect(cs({ hours: 0, minutes: 1, seconds: 9, microseconds: 930000 }, "500m")).toBe(6993)
  })
})

describe("parseLegacyTime — status codes are not times", () => {
  it("reports FS and DQ as status codes, never as 0", () => {
    const fs = parseLegacyTime("FS", "200m")
    expect(fs.ok).toBe(false)
    if (!fs.ok) {
      expect(fs.reason).toBe("status_code")
      expect(fs.status).toBe("fs")
      expect(fs.raw).toBe("FS")
    }

    const dq = parseLegacyTime("DQ", "200m")
    expect(dq.ok).toBe(false)
    if (!dq.ok) {
      expect(dq.reason).toBe("status_code")
      expect(dq.status).toBe("dq")
    }
  })

  it("recognises DNS and DNF case-insensitively", () => {
    const dns = parseLegacyTime("dns", "100m")
    expect(dns.ok).toBe(false)
    if (!dns.ok) expect(dns.status).toBe("dns")

    const dnf = parseLegacyTime("DNF", "100m")
    expect(dnf.ok).toBe(false)
    if (!dnf.ok) expect(dnf.status).toBe("dnf")
  })
})

describe("parseLegacyTime — plausibility bands catch misparses", () => {
  it("rejects a minute-scale time misread as seconds in a middle-distance race", () => {
    // This is the exact failure the bands exist for: if "1.50.50" were parsed
    // as 1.5s, it would be 150cs, far below the 6000cs middle-distance floor.
    expect(cs(1.5, "middle")).toBe("fail:implausible_for_race")
    expect(cs(150, "100m")).toBe("fail:implausible_for_race")
  })

  it("rejects a 100m time that is impossibly fast or slow", () => {
    expect(cs(2.0, "100m")).toBe("fail:implausible_for_race")
    expect(cs(95.0, "100m")).toBe("fail:implausible_for_race")
  })

  it("accepts the full observed range of each race", () => {
    // Observed minima and maxima from the 3476 legacy rows.
    expect(parseLegacyTime(9.5, "100m").ok).toBe(true)
    expect(parseLegacyTime(22.94, "100m").ok).toBe(true)
    expect(parseLegacyTime(18.63, "200m").ok).toBe(true)
    expect(parseLegacyTime(42.56, "200m").ok).toBe(true)
    expect(parseLegacyTime(43.65, "500m").ok).toBe(true)
    expect(parseLegacyTime(59.94, "500m").ok).toBe(true)
    expect(parseLegacyTime(37.04, "one_lap").ok).toBe(true)
    expect(parseLegacyTime(75.6, "one_lap").ok).toBe(true)
  })

  it("exposes the band for import reporting", () => {
    expect(plausibleBandFor("100m")).toEqual([800, 4000])
    // Long-distance races have no band: durations vary far too widely.
    expect(plausibleBandFor("points_10000_road")).toBeUndefined()
  })
})

describe("parseLegacyTime — rejections", () => {
  it("reports empty cells", () => {
    expect(cs(null, "100m")).toBe("fail:empty")
    expect(cs(undefined, "100m")).toBe("fail:empty")
    expect(cs("", "100m")).toBe("fail:empty")
    expect(cs("   ", "100m")).toBe("fail:empty")
  })

  it("rejects an impossible seconds component rather than normalising it", () => {
    expect(cs("1:75.00", "middle")).toBe("fail:invalid_component")
    expect(cs("1.90.00", "middle")).toBe("fail:invalid_component")
  })

  it("rejects unrecognised text", () => {
    expect(cs("about a minute", "100m")).toBe("fail:unrecognised_format")
    expect(cs("1:2:3:4", "100m")).toBe("fail:unrecognised_format")
    expect(cs("--", "100m")).toBe("fail:unrecognised_format")
  })

  it("rejects non-positive and non-finite numerics", () => {
    expect(cs(0, "100m")).toBe("fail:invalid_component")
    expect(cs(-15.34, "100m")).toBe("fail:invalid_component")
    expect(cs(Number.NaN, "100m")).toBe("fail:invalid_component")
  })

  it("always preserves the raw value on failure", () => {
    const result = parseLegacyTime("  nonsense  ", "100m")
    expect(result.ok).toBe(false)
    expect(result.raw).toBe("  nonsense  ")
  })
})

describe("formatTime", () => {
  it("formats sub-minute times as SS.hh", () => {
    expect(formatTime(1534)).toBe("15.34")
    expect(formatTime(950)).toBe("9.50")
    expect(formatTime(1680)).toBe("16.80")
  })

  it("formats minute-and-over times as M:SS.hh, matching the score sheets", () => {
    expect(formatTime(6089)).toBe("1:00.89")
    expect(formatTime(11050)).toBe("1:50.50")
    expect(formatTime(17250)).toBe("2:52.50")
    expect(formatTime(6000)).toBe("1:00.00")
  })

  it("round-trips every legacy format back to its canonical display form", () => {
    const cases: ReadonlyArray<readonly [unknown, RaceCode, string]> = [
      [" 15.34", "100m", "15.34"],
      [" 1:00.89", "one_lap", "1:00.89"],
      ["1.50.50", "middle", "1:50.50"],
      ["1,39.88", "middle", "1:39.88"],
      ["2.52.5", "middle", "2:52.50"],
      [0.0007060185185185185, "500m", "1:01.00"],
    ]
    for (const [input, race, expected] of cases) {
      const parsed = parseLegacyTime(input, race)
      expect(parsed.ok, `${String(input)} should parse`).toBe(true)
      if (parsed.ok) expect(formatTime(parsed.centiseconds)).toBe(expected)
    }
  })

  it("throws on invalid input rather than producing a misleading string", () => {
    expect(() => formatTime(-1)).toThrow(/invalid time/)
    expect(() => formatTime(1.5)).toThrow(/invalid time/)
  })
})
