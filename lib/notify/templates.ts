/**
 * Notification emails: what each one says. Pure, so every message can be
 * checked in tests; sending is in ./send.ts.
 *
 * Every value that came from a person (names, reasons, notes) is escaped
 * before it goes into the HTML.
 */

export interface EmailMessage {
  readonly subject: string
  readonly html: string
  readonly text: string
}

export type Notification =
  // To the federation
  | { kind: "account_requested"; fullName: string; email: string; clubName: string | null }
  | { kind: "athlete_request_submitted"; clubName: string; requestKind: "new_athlete" | "correction"; athleteName: string | null }
  | { kind: "results_submitted"; roundLabel: string; roundId: string }
  // To a club
  | { kind: "account_approved"; fullName: string; clubName: string }
  | { kind: "account_rejected"; fullName: string; reason: string }
  | { kind: "account_suspended"; fullName: string }
  | { kind: "athlete_request_decided"; approved: boolean; requestKind: "new_athlete" | "correction"; athleteName: string | null; note: string | null }
  | { kind: "registration_opened"; roundLabel: string; deadline: string | null }
  | { kind: "start_list_published"; roundLabel: string; version: number; scheduledAt: string | null }
  | { kind: "results_published"; roundLabel: string }
  | { kind: "round_cancelled"; roundLabel: string; reason: string | null }

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

const cairo = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Africa/Cairo",
})

/** A timestamp as Cairo local time, e.g. «الخميس 12 نوفمبر، 6:00 م». */
export function cairoTime(iso: string): string {
  return cairo.format(new Date(iso))
}

interface Body {
  readonly subject: string
  readonly heading: string
  /** Paragraphs of plain text; escaped when rendered. */
  readonly lines: readonly string[]
  readonly action?: { readonly label: string; readonly path: string }
}

function body(n: Notification): Body {
  const requestWord = (k: "new_athlete" | "correction") => (k === "new_athlete" ? "تسجيل لاعب جديد" : "تصحيح بيانات لاعب")
  switch (n.kind) {
    case "account_requested":
      return {
        subject: `طلب حساب نادٍ جديد: ${n.fullName}`,
        heading: "طلب حساب نادٍ جديد",
        lines: [
          `${n.fullName} (${n.email}) أنشأ حساباً ويطلب تمثيل ${n.clubName ?? "نادٍ لم يحدده"}.`,
          "لا يرى الحساب أي بيانات حتى تتحقق منه وتوافق عليه.",
        ],
        action: { label: "مراجعة الطلب", path: "/dashboard/federation/accounts" },
      }
    case "athlete_request_submitted":
      return {
        subject: `طلب ${requestWord(n.requestKind)} من ${n.clubName}`,
        heading: `طلب ${requestWord(n.requestKind)}`,
        lines: [`أرسل ${n.clubName} طلب ${requestWord(n.requestKind)}${n.athleteName ? `: ${n.athleteName}` : ""}.`],
        action: { label: "مراجعة الطلب", path: "/dashboard/federation/requests" },
      }
    case "results_submitted":
      return {
        subject: `نتائج بانتظار الاعتماد: ${n.roundLabel}`,
        heading: "نتائج بانتظار الاعتماد",
        lines: [`أُدخلت نتائج ${n.roundLabel} وأُرسلت للاعتماد.`, "لا يُبنى الدور التالي قبل اعتمادها."],
        action: { label: "مراجعة النتائج", path: `/dashboard/federation/rounds/${n.roundId}/results` },
      }
    case "account_approved":
      return {
        subject: "تم تفعيل حساب النادي",
        heading: `أهلاً ${n.fullName}`,
        lines: [
          `وافق الاتحاد على حسابك وربطه بـ ${n.clubName}.`,
          "يمكنك الآن الدخول لمراجعة لاعبي النادي وتسجيلهم في السباقات عند فتح التسجيل.",
        ],
        action: { label: "الدخول إلى لوحة النادي", path: "/login" },
      }
    case "account_rejected":
      return {
        subject: "لم تتم الموافقة على طلب حساب النادي",
        heading: `أهلاً ${n.fullName}`,
        lines: [`لم يوافق الاتحاد على طلب الحساب. السبب: ${n.reason}`, "إذا كان هناك خطأ، تواصل مع الاتحاد مباشرة."],
      }
    case "account_suspended":
      return {
        subject: "تم إيقاف حساب النادي",
        heading: `أهلاً ${n.fullName}`,
        lines: ["أوقف الاتحاد حسابك على منصة السباقات مؤقتاً.", "تواصل مع الاتحاد لمعرفة السبب وإعادة التفعيل."],
      }
    case "athlete_request_decided":
      return {
        subject: `${n.approved ? "تمت الموافقة على" : "رُفض"} طلب ${requestWord(n.requestKind)}`,
        heading: n.approved ? "تمت الموافقة على الطلب" : "رُفض الطلب",
        lines: [
          `طلب ${requestWord(n.requestKind)}${n.athleteName ? `: ${n.athleteName}` : ""} — ${n.approved ? "طُبّق التغيير على سجل اللاعب." : "لم يتغير شيء في سجل اللاعب."}`,
          ...(n.note ? [`ملاحظة الاتحاد: ${n.note}`] : []),
        ],
        action: { label: "طلبات اللاعبين", path: "/dashboard/club/requests" },
      }
    case "registration_opened":
      return {
        subject: `فُتح التسجيل: ${n.roundLabel}`,
        heading: "فُتح التسجيل",
        lines: [
          `فتح الاتحاد التسجيل في ${n.roundLabel}.`,
          n.deadline ? `آخر موعد للتسجيل: ${cairoTime(n.deadline)} بتوقيت القاهرة.` : "راجع آخر موعد للتسجيل في المنصة.",
          "تظهر لكل سباق أسماء لاعبي ناديك المؤهلين فقط.",
        ],
        action: { label: "سجّل لاعبيك", path: "/dashboard/club/entries" },
      }
    case "start_list_published":
      return {
        subject: `قائمة البدء: ${n.roundLabel}`,
        heading: n.version > 1 ? "نُشرت قائمة بدء معدّلة" : "نُشرت قائمة البدء",
        lines: [
          `نشر الاتحاد قائمة البدء لـ ${n.roundLabel}${n.version > 1 ? ` (النسخة ${n.version}، وتحل محل السابقة)` : ""}.`,
          ...(n.scheduledAt ? [`موعد السباق: ${cairoTime(n.scheduledAt)} بتوقيت القاهرة.`] : []),
        ],
        action: { label: "عرض في المنصة", path: "/dashboard/club/entries" },
      }
    case "results_published":
      return {
        subject: `النتائج الرسمية: ${n.roundLabel}`,
        heading: "نُشرت النتائج الرسمية",
        lines: [`اعتمد الاتحاد ونشر نتائج ${n.roundLabel}.`],
        action: { label: "عرض في المنصة", path: "/dashboard/club" },
      }
    case "round_cancelled":
      return {
        subject: `أُلغي السباق: ${n.roundLabel}`,
        heading: "أُلغي السباق",
        lines: [`ألغى الاتحاد ${n.roundLabel}.`, ...(n.reason ? [`السبب: ${n.reason}`] : [])],
      }
  }
}

const FOOTER = "رسالة تلقائية من منصة سباقات السرعة — الاتحاد المصري للتزلج. لا ترد على هذه الرسالة."

export function renderNotification(n: Notification, siteUrl: string): EmailMessage {
  const b = body(n)
  const url = b.action ? new URL(b.action.path, siteUrl).toString() : null
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<body style="margin:0;background:#f4f4f5;font-family:Tahoma,Arial,sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border-radius:8px;padding:28px 24px;border-top:4px solid #dc2626;text-align:right">
      <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(b.heading)}</h1>
      ${b.lines.map((l) => `<p style="margin:0 0 12px;line-height:1.7;font-size:15px">${escapeHtml(l)}</p>`).join("\n      ")}
      ${
        url && b.action
          ? `<p style="margin:24px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px">${escapeHtml(b.action.label)}</a></p>`
          : ""
      }
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#71717a;text-align:center">${escapeHtml(FOOTER)}</p>
  </div>
</body>
</html>`
  const text = [b.heading, "", ...b.lines, ...(url && b.action ? ["", `${b.action.label}: ${url}`] : []), "", FOOTER].join("\n")
  return { subject: b.subject, html, text }
}
