import { describe, expect, it } from "vitest"
import { cairoTime, escapeHtml, renderNotification, type Notification } from "../templates"

const SITE = "https://esf.example.org"

const ALL: Notification[] = [
  { kind: "account_requested", fullName: "أحمد محمد علي", email: "a@club.org", clubName: "نادي الصيد" },
  { kind: "athlete_request_submitted", clubName: "نادي الصيد", requestKind: "new_athlete", athleteName: "لاعب جديد" },
  { kind: "results_submitted", roundLabel: "دور ال 16 100m — الجولة الأولى", roundId: "r1" },
  { kind: "account_approved", fullName: "أحمد", clubName: "نادي الصيد" },
  { kind: "account_rejected", fullName: "أحمد", reason: "لا يوجد ما يثبت تمثيل النادي" },
  { kind: "account_suspended", fullName: "أحمد" },
  { kind: "athlete_request_decided", approved: false, requestKind: "correction", athleteName: "لاعب", note: "الشهادة غير واضحة" },
  { kind: "registration_opened", roundLabel: "جولة التصفيات 100m", deadline: "2026-11-12T16:00:00Z" },
  { kind: "start_list_published", roundLabel: "جولة التصفيات 100m", version: 2, scheduledAt: null },
  { kind: "results_published", roundLabel: "النهائي 500m" },
  { kind: "round_cancelled", roundLabel: "النهائي 500m", reason: "سوء الأحوال الجوية" },
]

describe("renderNotification", () => {
  it.each(ALL.map((n) => [n.kind, n] as const))("%s has a subject, RTL html and text", (_kind, n) => {
    const m = renderNotification(n, SITE)
    expect(m.subject.length).toBeGreaterThan(5)
    expect(m.html).toContain('dir="rtl"')
    expect(m.text).toContain("لا ترد على هذه الرسالة")
  })

  it("escapes values people typed", () => {
    const m = renderNotification({ kind: "account_rejected", fullName: "<script>x</script>", reason: 'a"b<img>' }, SITE)
    expect(m.html).not.toContain("<script>")
    expect(m.html).not.toContain("<img>")
    expect(m.html).toContain("&lt;script&gt;")
  })

  it("links to the platform with the site's own address", () => {
    const m = renderNotification({ kind: "results_submitted", roundLabel: "x", roundId: "abc" }, SITE)
    expect(m.html).toContain('href="https://esf.example.org/dashboard/federation/rounds/abc/results"')
    expect(m.text).toContain("https://esf.example.org/dashboard/federation/rounds/abc/results")
  })

  it("gives the registration deadline in Cairo time", () => {
    // 16:00 UTC is 18:00 in Cairo (UTC+2 in November).
    const m = renderNotification({ kind: "registration_opened", roundLabel: "x", deadline: "2026-11-12T16:00:00Z" }, SITE)
    expect(m.text).toContain(cairoTime("2026-11-12T16:00:00Z"))
    expect(cairoTime("2026-11-12T16:00:00Z")).toMatch(/6:00/)
  })

  it("says when a start list replaces an earlier one", () => {
    const first = renderNotification({ kind: "start_list_published", roundLabel: "x", version: 1, scheduledAt: null }, SITE)
    const second = renderNotification({ kind: "start_list_published", roundLabel: "x", version: 2, scheduledAt: null }, SITE)
    expect(first.text).not.toContain("النسخة")
    expect(second.text).toContain("النسخة 2")
  })
})

describe("escapeHtml", () => {
  it("escapes the five HTML characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;")
  })
})
