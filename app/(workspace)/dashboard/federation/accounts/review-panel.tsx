"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { inputClass } from "@/components/workspace/form"
import type { Club } from "@/lib/competition/clubs"
import { reviewClubAccount, type ReviewState } from "./actions"

function Button({ children, tone }: { children: React.ReactNode; tone: "approve" | "reject" }) {
  const { pending } = useFormStatus()
  return (
    <button
      disabled={pending}
      className={
        "h-10 shrink-0 rounded-md px-4 text-sm font-semibold disabled:opacity-60 " +
        (tone === "approve" ? "bg-ws-ok text-white hover:opacity-90" : "border border-ws-stop/40 text-ws-stop hover:bg-ws-stop-wash")
      }
    >
      {pending ? "جارٍ الحفظ…" : children}
    </button>
  )
}

export function ReviewPanel({
  profileId,
  requestedClubCode,
  clubs,
}: {
  profileId: string
  requestedClubCode?: string
  clubs: readonly Club[]
}) {
  const [mode, setMode] = useState<"approve" | "reject">("approve")
  const [state, action] = useFormState<ReviewState, FormData>(reviewClubAccount, {})

  if (state.ok) {
    return <p className="rounded-md bg-ws-ok-wash px-4 py-3 text-sm text-ws-ok">{state.ok}</p>
  }

  return (
    <div className="flex flex-col gap-3 rounded-md bg-ws-sunk p-4">
      <div role="radiogroup" aria-label="القرار" className="flex gap-1 self-start rounded-md bg-ws-raised p-1">
        {(
          [
            ["approve", "موافقة"],
            ["reject", "رفض"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={
              "rounded px-3 py-1.5 text-sm " + (mode === value ? "bg-ws-ink font-medium text-ws-paper" : "text-ws-muted hover:text-ws-ink")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="profileId" value={profileId} />
        <input type="hidden" name="decision" value={mode} />
        {mode === "approve" ? (
          <label className="flex flex-1 flex-col gap-1.5 text-sm text-ws-soft">
            ربط الحساب بنادي
            <select name="clubCode" defaultValue={requestedClubCode ?? ""} className={inputClass}>
              <option value="" disabled>
                اختر النادي
              </option>
              {clubs.map((club) => (
                <option key={club.code} value={club.code}>
                  {club.nameAr} ({club.code})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-1 flex-col gap-1.5 text-sm text-ws-soft">
            سبب الرفض — يظهر لصاحب الطلب
            <input name="reason" className={inputClass} placeholder="مثال: لا يوجد ما يثبت تمثيل النادي." />
          </label>
        )}
        <Button tone={mode}>{mode === "approve" ? "الموافقة وربط النادي" : "رفض الطلب"}</Button>
      </form>

      {state.error ? <p className="text-sm text-ws-stop">{state.error}</p> : null}
    </div>
  )
}

/** Takes an approved account's access away at once. It can be approved again later. */
export function SuspendForm({ profileId }: { profileId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [state, action] = useFormState<ReviewState, FormData>(reviewClubAccount, {})

  if (state.ok) return <p className="rounded-md bg-ws-ok-wash px-4 py-3 text-sm text-ws-ok">{state.ok}</p>

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-start text-sm text-ws-muted underline-offset-4 hover:text-ws-stop hover:underline"
      >
        إيقاف الحساب
      </button>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md bg-ws-stop-wash p-4 sm:flex-row sm:items-center">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="decision" value="suspend" />
      <p className="flex-1 text-sm text-ws-stop">يفقد صاحب الحساب الوصول فوراً. يمكنك إعادة تفعيله لاحقاً من تبويب «موقوفة».</p>
      <div className="flex gap-2">
        <Button tone="reject">تأكيد الإيقاف</Button>
        <button type="button" onClick={() => setConfirming(false)} className="h-10 rounded-md px-3 text-sm text-ws-muted hover:text-ws-ink">
          إلغاء
        </button>
      </div>
      {state.error ? <p className="text-sm text-ws-stop">{state.error}</p> : null}
    </form>
  )
}
