import { NextResponse, type NextRequest } from "next/server"
import { getCurrentAccount } from "@/lib/auth/account"
import { buildScoreSheetWorkbook, buildStartListWorkbook, sheetName } from "@/lib/competition/export/workbooks"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import { CHAMPIONSHIP_LABEL, CURRENT_SEASON } from "@/lib/workspace/competition"
import { loadRoundStartList } from "@/lib/workspace/start-lists"

export const dynamic = "force-dynamic"

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const dateFormat = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

/**
 * Downloads the start list or score sheet. The published version when there is
 * one; otherwise the current preview, marked as a draft on every sheet.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ round: string }> }) {
  const account = await getCurrentAccount()
  if (!account || account.status !== "approved" || account.role === "club_admin" || account.isDemo) {
    return new NextResponse("Forbidden", { status: 403 })
  }
  const { round: id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 })

  const loaded = await loadRoundStartList(id)
  const list = loaded?.published?.list ?? loaded?.preview
  if (!loaded || !list) return new NextResponse("Not found", { status: 404 })

  const doc = request.nextUrl.searchParams.get("doc") === "score-sheet" ? "score-sheet" : "start-list"
  const meta = {
    title: [CHAMPIONSHIP_LABEL[loaded.event.championship], loaded.event.nameAr, loaded.round.nameAr, `موسم ${CURRENT_SEASON}`].join(" - "),
    subtitle: [loaded.event.venueAr, loaded.event.eventDate ? dateFormat.format(new Date(loaded.event.eventDate)) : null].filter(Boolean).join(" - "),
    ruleset: SEASON_2026_2027,
    draft: !loaded.published,
  }
  const bytes = doc === "score-sheet" ? await buildScoreSheetWorkbook(list, meta) : await buildStartListWorkbook(list, meta)

  const base = `${doc === "score-sheet" ? "Score Sheet" : "Start List"} - ${sheetName(list.race, list.roundKey)}${
    loaded.published ? ` v${loaded.published.version}` : " DRAFT"
  }.xlsx`
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${base}"`,
      "Cache-Control": "no-store",
    },
  })
}
