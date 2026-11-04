"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { FormError, inputClass } from "@/components/workspace/form"
import { decideResults, importScoreSheet, saveResults, type ResultsState } from "./actions"

export interface EntryRow {
  readonly athleteId: string
  readonly lane: number
  readonly federationNumber: number
  readonly fullName: string
  readonly clubName: string
  readonly status: string
  readonly time: string
  readonly position: string
}

export interface EntryHeat {
  readonly key: string
  readonly title: string
  readonly rows: readonly EntryRow[]
}

const STATUS_OPTIONS = [
  ["ok", "أنهى"],
  ["dns", "لم يبدأ DNS"],
  ["dnf", "لم يكمل DNF"],
  ["dq", "استبعاد DQ"],
  ["fs", "بداية خاطئة FS"],
] as const

function Button({ intent, children, tone = "ink" }: { intent?: string; children: React.ReactNode; tone?: "ink" | "red" | "ok" | "stop" | "quiet" }) {
  const { pending } = useFormStatus()
  const tones = {
    ink: "bg-ws-ink text-ws-paper",
    red: "bg-ws-red text-white",
    ok: "bg-ws-ok text-white",
    stop: "border border-ws-stop/40 text-ws-stop hover:bg-ws-stop-wash",
    quiet: "border border-ws-rule text-ws-soft hover:bg-ws-sunk",
  }
  return (
    <button name={intent ? "intent" : undefined} value={intent} disabled={pending} className={"h-10 rounded-md px-4 text-sm font-semibold hover:opacity-90 disabled:opacity-60 " + tones[tone]}>
      {pending ? "…" : children}
    </button>
  )
}

function Feedback({ state }: { state: ResultsState }) {
  if (state.error) return <FormError message={state.error} />
  if (state.ok) return <p className="text-sm text-ws-ok">{state.ok}</p>
  return null
}

export function ResultsEntryForm({ round, heats, massStart }: { round: string; heats: readonly EntryHeat[]; massStart: boolean }) {
  const [state, action] = useFormState<ResultsState, FormData>(saveResults, {})
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="round" value={round} />
      {heats.map((heat) => (
        <div key={heat.key} className="overflow-x-auto rounded-md border border-ws-rule bg-ws-raised">
          <p className="border-b border-ws-rule bg-ws-sunk px-4 py-2 text-sm font-medium text-ws-ink">
            <bdi dir="ltr">{heat.title}</bdi>
          </p>
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="text-ws-muted">
              <tr>
                <th className="px-3 py-1.5 text-start font-medium">{massStart ? "No." : "Lane"}</th>
                <th className="px-3 py-1.5 text-start font-medium">Bib</th>
                <th className="px-3 py-1.5 text-start font-medium">الاسم</th>
                <th className="px-3 py-1.5 text-start font-medium">الزمن</th>
                <th className="px-3 py-1.5 text-start font-medium">المركز</th>
                <th className="px-3 py-1.5 text-start font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ws-rule">
              {heat.rows.map((r) => {
                const error = state.rowErrors?.[r.athleteId]
                return (
                  <tr key={r.athleteId} className={error ? "bg-ws-stop-wash" : undefined}>
                    <td className="px-3 py-1.5 tabular text-ws-muted">{r.lane}</td>
                    <td className="px-3 py-1.5 tabular">{r.federationNumber}</td>
                    <td className="px-3 py-1.5">
                      <span className="text-ws-ink">{r.fullName}</span>
                      <span className="ms-2 text-xs text-ws-muted">{r.clubName}</span>
                      {error ? <span className="block text-xs text-ws-stop">{error}</span> : null}
                      <input type="hidden" name="athlete" value={r.athleteId} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        name={`time:${r.athleteId}`}
                        defaultValue={r.time}
                        dir="ltr"
                        inputMode="decimal"
                        placeholder={massStart ? "" : "15.34"}
                        aria-label={`زمن ${r.fullName}`}
                        className={inputClass + " h-9 w-28 tabular"}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        name={`position:${r.athleteId}`}
                        defaultValue={r.position}
                        inputMode="numeric"
                        aria-label={`مركز ${r.fullName}`}
                        className={inputClass + " h-9 w-16 tabular"}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select name={`status:${r.athleteId}`} defaultValue={r.status} aria-label={`حالة ${r.fullName}`} className={inputClass + " h-9 w-auto"}>
                        {STATUS_OPTIONS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
      <Feedback state={state} />
      <div className="flex flex-wrap gap-3">
        <Button tone="quiet">حفظ كمسودة</Button>
        <Button intent="submit" tone="red">
          حفظ وإرسال للاعتماد
        </Button>
      </div>
    </form>
  )
}

export function ImportScoreSheetForm({ round }: { round: string }) {
  const [state, action] = useFormState<ResultsState, FormData>(importScoreSheet, {})
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="round" value={round} />
      <input
        type="file"
        name="file"
        required
        accept=".xlsx"
        className={inputClass + " h-auto py-2 file:me-3 file:rounded file:border-0 file:bg-ws-sunk file:px-3 file:py-1"}
      />
      <Feedback state={state} />
      <div>
        <Button tone="quiet">قراءة ورقة التحكيم</Button>
      </div>
    </form>
  )
}

export function DecisionForm({ round, options }: { round: string; options: readonly ("approve" | "return" | "publish" | "correct")[] }) {
  const [state, action] = useFormState<ResultsState, FormData>(decideResults, {})
  const [chosen, setChosen] = useState<string | null>(null)
  const labels = { approve: "اعتماد النتائج", return: "إعادة للتصحيح", publish: "نشر للعامة", correct: "تصحيح نتائج معتمدة" }
  const needsReason = chosen === "return" || chosen === "correct"
  if (state.ok) return <p className="rounded-md bg-ws-ok-wash px-4 py-3 text-sm text-ws-ok">{state.ok}</p>
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="round" value={round} />
      <div className="flex flex-wrap gap-3">
        {options.map((o) =>
          (o === "return" || o === "correct") && chosen !== o ? (
            <button key={o} type="button" onClick={() => setChosen(o)} className="h-10 rounded-md border border-ws-rule px-4 text-sm text-ws-soft hover:bg-ws-sunk">
              {labels[o]}
            </button>
          ) : (
            <button
              key={o}
              name="decision"
              value={o}
              className={
                "h-10 rounded-md px-4 text-sm font-semibold hover:opacity-90 " +
                (o === "approve" ? "bg-ws-ok text-white" : o === "publish" ? "bg-ws-red text-white" : "bg-ws-ink text-ws-paper")
              }
            >
              {needsReason && chosen === o ? `تأكيد: ${labels[o]}` : labels[o]}
            </button>
          )
        )}
      </div>
      {needsReason ? <input name="reason" required minLength={3} placeholder="السبب — يُحفظ في السجل" className={inputClass} /> : null}
      <Feedback state={state} />
    </form>
  )
}
