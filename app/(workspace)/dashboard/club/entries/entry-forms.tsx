"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { FormError } from "@/components/workspace/form"
import { submitEntries, withdrawEntry, type EntryState } from "./actions"

export interface Candidate {
  readonly id: string
  readonly federationNumber: number
  readonly fullName: string
  readonly category: string
  readonly gender: "M" | "F"
}

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      disabled={pending || count === 0}
      className="h-10 rounded-md bg-ws-red px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "جارٍ التسجيل…" : count === 0 ? "اختر لاعبين" : `تسجيل ${count} لاعب`}
    </button>
  )
}

export function EntryForm({ round, candidates }: { round: string; candidates: readonly Candidate[] }) {
  const [state, action] = useFormState<EntryState, FormData>(submitEntries, {})
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="round" value={round} />
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">اللاعبون المؤهلون</legend>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm text-ws-muted">{candidates.length} لاعب مؤهل لم يُسجل بعد</span>
          <button
            type="button"
            onClick={() => setSelected(selected.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.id)))}
            className="text-sm text-ws-soft underline-offset-4 hover:underline"
          >
            {selected.size === candidates.length ? "إلغاء الكل" : "اختيار الكل"}
          </button>
        </div>
        <ul className="grid max-h-80 gap-1 overflow-y-auto rounded-md border border-ws-rule p-1 sm:grid-cols-2">
          {candidates.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded px-3 py-2 hover:bg-ws-sunk has-[:checked]:bg-ws-sunk">
                <input
                  type="checkbox"
                  name="athlete"
                  value={c.id}
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="size-4 accent-ws-red"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ws-ink">{c.fullName}</span>
                  <span className="text-xs text-ws-muted">
                    <bdi className="tabular">{c.federationNumber}</bdi> · {c.category} · {c.gender === "F" ? "بنات" : "بنين"}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {state.error ? <FormError message={state.error} /> : null}
      {state.ok ? <p className="text-sm text-ws-ok">{state.ok}</p> : null}
      <div>
        <Submit count={selected.size} />
      </div>
    </form>
  )
}

export function WithdrawButton({ entry }: { entry: string }) {
  const [state, action] = useFormState<EntryState, FormData>(withdrawEntry, {})
  const [confirming, setConfirming] = useState(false)
  if (state.ok) return <span className="text-xs text-ws-ok">{state.ok}</span>
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="entry" value={entry} />
      {confirming ? (
        <button className="text-xs font-medium text-ws-stop hover:underline">تأكيد السحب</button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="text-xs text-ws-muted hover:text-ws-stop">
          سحب
        </button>
      )}
      {state.error ? <span className="text-xs text-ws-stop">{state.error}</span> : null}
    </form>
  )
}
