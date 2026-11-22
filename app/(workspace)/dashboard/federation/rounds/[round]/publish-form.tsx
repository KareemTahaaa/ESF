"use client"

import { useFormState, useFormStatus } from "react-dom"
import { FormError } from "@/components/workspace/form"
import { publishStartList, type PublishState } from "./actions"

function Button({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button disabled={pending} className="h-10 rounded-md bg-ws-red px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
      {pending ? "جارٍ النشر…" : label}
    </button>
  )
}

export function PublishForm({ round, label = "نشر قائمة البدء رسمياً" }: { round: string; label?: string }) {
  const [state, action] = useFormState<PublishState, FormData>(publishStartList, {})
  if (state.ok) return <p className="text-sm text-ws-ok">{state.ok}</p>
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="round" value={round} />
      <div>
        <Button label={label} />
      </div>
      <FormError message={state.error} />
    </form>
  )
}
