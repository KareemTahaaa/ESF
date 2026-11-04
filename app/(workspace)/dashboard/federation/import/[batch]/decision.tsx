"use client"

import { useFormState, useFormStatus } from "react-dom"
import { decideImport, type DecisionState } from "../actions"

function Button({ decision, children }: { decision: "commit" | "discard"; children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button
      name="decision"
      value={decision}
      disabled={pending}
      className={
        "h-11 rounded-md px-5 text-sm font-semibold disabled:opacity-60 " +
        (decision === "commit" ? "bg-ws-ok text-white hover:opacity-90" : "border border-ws-rule text-ws-soft hover:bg-ws-sunk")
      }
    >
      {pending ? "جارٍ التنفيذ…" : children}
    </button>
  )
}

export function ImportDecision({ batch, importable }: { batch: string; importable: number }) {
  const [state, action] = useFormState<DecisionState, FormData>(decideImport, {})
  if (state.ok) return <p className="rounded-md bg-ws-ok-wash px-4 py-3 text-sm text-ws-ok">{state.ok}</p>

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="batch" value={batch} />
      <div className="flex flex-wrap gap-3">
        <Button decision="commit">استيراد {importable.toLocaleString("en-US")} صف</Button>
        <Button decision="discard">تجاهل الملف</Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-ws-stop">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
