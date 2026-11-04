"use server"

import { revalidatePath } from "next/cache"
import { getCurrentAccount, requireFederationAdmin } from "@/lib/auth/account"
import { readWorkbook } from "@/lib/competition/import/workbook"
import { cellText, parseResultInputs, readScoreSheet, type LineStatus, type ResultInput } from "@/lib/competition/results"
import { startListAthleteIds } from "@/lib/competition/start-list"
import { FEDERATION_INBOX, clubAdminEmails, clubsInRound, notify, roundContext } from "@/lib/notify/send"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { loadRoundResults } from "@/lib/workspace/results"

export interface ResultsState {
  readonly ok?: string
  readonly error?: string
  /** Per-athlete problems, keyed by athlete id. */
  readonly rowErrors?: Readonly<Record<string, string>>
}

const UUID = /^[0-9a-f-]{36}$/
const STATUSES: readonly LineStatus[] = ["ok", "dns", "dnf", "dq", "fs"]

async function requireStaff() {
  const account = await getCurrentAccount()
  if (!account || account.status !== "approved" || account.role === "club_admin" || account.isDemo) {
    throw new Error("Only federation staff can enter results.")
  }
  return account
}

async function saveInputs(round: string, inputs: ResultInput[]): Promise<ResultsState> {
  const loaded = await loadRoundResults(round)
  if (!loaded?.startList) return { error: "لا توجد قائمة بدء منشورة لهذا الدور." }
  const outcome = parseResultInputs(loaded.round.race, inputs, loaded.round.roundKey === "race")
  if (!outcome.ok) {
    return { error: `${outcome.errors.size} نتيجة تحتاج تصحيحاً قبل الحفظ.`, rowErrors: Object.fromEntries(outcome.errors) }
  }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("save_results", { round, lines: outcome.lines })
  if (error) return { error: error.message }
  revalidatePath(`/dashboard/federation/rounds/${round}/results`)
  return { ok: "حُفظت النتائج كمسودة." }
}

export async function saveResults(_prev: ResultsState, formData: FormData): Promise<ResultsState> {
  await requireStaff()
  const round = String(formData.get("round") ?? "")
  if (!UUID.test(round)) return { error: "طلب غير صالح." }
  const ids = formData.getAll("athlete").map(String)
  const inputs: ResultInput[] = ids.map((id) => {
    const status = String(formData.get(`status:${id}`) ?? "ok") as LineStatus
    return {
      athleteId: id,
      status: STATUSES.includes(status) ? status : "ok",
      time: String(formData.get(`time:${id}`) ?? ""),
      position: String(formData.get(`position:${id}`) ?? ""),
    }
  })
  const state = await saveInputs(round, inputs)
  if (state.ok && formData.get("intent") === "submit") {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc("submit_results", { round })
    if (error) return { error: error.message }
    await notify(async () => ({
      to: [FEDERATION_INBOX],
      notification: { kind: "results_submitted", roundLabel: (await roundContext(round)).label, roundId: round },
    }))
    revalidatePath("/dashboard", "layout")
    return { ok: "أُرسلت النتائج للاعتماد." }
  }
  return state
}

/**
 * Fills the draft from a score sheet that officials completed by hand. Rows
 * are matched to the start list by bib; anything that does not match is
 * reported, and nothing is saved unless every athlete is accounted for.
 */
export async function importScoreSheet(_prev: ResultsState, formData: FormData): Promise<ResultsState> {
  await requireStaff()
  const round = String(formData.get("round") ?? "")
  const file = formData.get("file")
  if (!UUID.test(round)) return { error: "طلب غير صالح." }
  if (!(file instanceof File) || file.size === 0) return { error: "اختر ملف ورقة التحكيم." }
  const loaded = await loadRoundResults(round)
  if (!loaded?.startList) return { error: "لا توجد قائمة بدء منشورة لهذا الدور." }

  let rows
  try {
    const sheets = await readWorkbook(new Uint8Array(await file.arrayBuffer()))
    rows = sheets.flatMap(readScoreSheet)
  } catch {
    return { error: "تعذّرت قراءة الملف." }
  }
  const byNumber = new Map<number, string>()
  for (const g of loaded.startList.list.groups) for (const h of g.heats) for (const l of h.lanes) byNumber.set(l.entrant.federationNumber, l.entrant.athleteId)

  const unknown = rows.filter((r) => !byNumber.has(r.federationNumber)).map((r) => r.federationNumber)
  if (unknown.length > 0) return { error: `أرقام في الملف ليست في قائمة البدء: ${unknown.join("، ")}` }
  const found = new Set(rows.map((r) => r.federationNumber))
  const missing = [...byNumber.keys()].filter((n) => !found.has(n))
  if (missing.length > 0) return { error: `لاعبون في قائمة البدء بلا صف في الملف: ${missing.join("، ")}` }
  if (found.size !== rows.length) return { error: "رقم لاعب مكرر في الملف." }

  const inputs: ResultInput[] = rows.map((r) => {
    const time = cellText(r.time)
    return {
      athleteId: byNumber.get(r.federationNumber)!,
      status: time === "" && cellText(r.position) === "" ? "dns" : "ok",
      time,
      position: cellText(r.position),
    }
  })
  if (startListAthleteIds(loaded.startList.list).length !== inputs.length) return { error: "الملف لا يطابق قائمة البدء." }
  const state = await saveInputs(round, inputs)
  return state.ok ? { ok: "قُرئت ورقة التحكيم وحُفظت النتائج كمسودة. راجعها ثم أرسلها للاعتماد." } : state
}

export async function decideResults(_prev: ResultsState, formData: FormData): Promise<ResultsState> {
  await requireFederationAdmin()
  const round = String(formData.get("round") ?? "")
  const decision = String(formData.get("decision") ?? "")
  const reason = String(formData.get("reason") ?? "").trim()
  if (!UUID.test(round)) return { error: "طلب غير صالح." }
  const supabase = await createSupabaseServerClient()
  const calls: Record<string, () => PromiseLike<{ error: { message: string } | null }>> = {
    approve: () => supabase.rpc("approve_results", { round }),
    return: () => supabase.rpc("return_results", { round, reason }),
    publish: () => supabase.rpc("publish_results", { round }),
    correct: () => supabase.rpc("correct_results", { round, reason }),
  }
  const call = calls[decision]
  if (!call) return { error: "طلب غير صالح." }
  if ((decision === "return" || decision === "correct") && reason.length < 3) return { error: "اكتب السبب؛ يُحفظ في السجل." }
  const { error } = await call()
  if (error) return { error: error.message }
  if (decision === "publish") {
    await notify(async () => ({
      to: await clubAdminEmails(await clubsInRound(round)),
      notification: { kind: "results_published", roundLabel: (await roundContext(round)).label },
    }))
  }
  revalidatePath("/dashboard", "layout")
  const done: Record<string, string> = {
    approve: "اعتُمدت النتائج. أصبح الدور مكتملاً ويمكن تفعيل الأدوار التالية.",
    return: "أُعيدت النتائج للتصحيح.",
    publish: "نُشرت النتائج للعامة.",
    correct: "فُتحت نسخة جديدة للتصحيح، ووُضعت علامة مراجعة على الأدوار التالية.",
  }
  return { ok: done[decision] }
}
