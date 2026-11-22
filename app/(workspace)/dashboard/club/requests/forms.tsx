"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { FormError, inputClass } from "@/components/workspace/form"
import { submitAthleteRequest, withdrawAthleteRequest, type RequestState } from "./actions"

export interface RosterOption {
  readonly id: string
  readonly federationNumber: number
  readonly fullName: string
  readonly birthYear: number | null
  readonly gender: "M" | "F"
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button disabled={pending} className="h-10 rounded-md bg-ws-red px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
      {pending ? "جارٍ الإرسال…" : label}
    </button>
  )
}

export function RequestForm({ roster, preselected }: { roster: readonly RosterOption[]; preselected?: string }) {
  const [state, action] = useFormState<RequestState, FormData>(submitAthleteRequest, {})
  const [kind, setKind] = useState<"correction" | "new_athlete">(preselected ? "correction" : "correction")
  const [athleteId, setAthleteId] = useState(preselected ?? "")
  const athlete = roster.find((a) => a.id === athleteId)

  if (state.ok) return <p className="rounded-md bg-ws-ok-wash px-4 py-3 text-sm text-ws-ok">{state.ok}</p>

  return (
    <form action={action} className="flex flex-col gap-4 rounded-md border border-ws-rule bg-ws-raised p-5">
      <input type="hidden" name="kind" value={kind} />
      <div role="radiogroup" aria-label="نوع الطلب" className="flex gap-1 self-start rounded-md bg-ws-sunk p-1">
        {(
          [
            ["correction", "تصحيح بيانات لاعب"],
            ["new_athlete", "تسجيل لاعب جديد"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => setKind(value)}
            className={"rounded px-3 py-1.5 text-sm " + (kind === value ? "bg-ws-ink font-medium text-ws-paper" : "text-ws-muted")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {kind === "correction" ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ws-ink sm:col-span-2">
            اللاعب
            <select name="athlete" required value={athleteId} onChange={(e) => setAthleteId(e.target.value)} className={inputClass}>
              <option value="" disabled>
                اختر من لاعبي النادي
              </option>
              {roster.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName} ({a.federationNumber})
                </option>
              ))}
            </select>
            {athlete ? (
              <span className="font-normal text-ws-muted">
                المسجل حالياً: سنة الميلاد {athlete.birthYear ?? "غير مسجلة"} · {athlete.gender === "F" ? "بنات" : "بنين"}. املأ
                الحقول التي يجب تغييرها فقط.
              </span>
            ) : null}
          </label>
        ) : (
          <p className="text-sm text-ws-muted sm:col-span-2">
            يحدد الاتحاد رقم اللاعب عند الموافقة. أرفق ما يثبت البيانات عند التواصل مع الاتحاد إن طُلب.
          </p>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ws-ink sm:col-span-2">
          {kind === "new_athlete" ? "الاسم الكامل" : "الاسم الصحيح (إن كان خاطئاً)"}
          <input name="fullName" required={kind === "new_athlete"} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ws-ink">
          سنة الميلاد
          <input name="birthYear" required={kind === "new_athlete"} inputMode="numeric" maxLength={4} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ws-ink">
          النوع
          <select name="gender" required={kind === "new_athlete"} defaultValue="" className={inputClass}>
            <option value="">{kind === "new_athlete" ? "اختر" : "بدون تغيير"}</option>
            <option value="F">بنات</option>
            <option value="M">بنين</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ws-ink sm:col-span-2">
          ملاحظة للاتحاد (اختيارية)
          <input name="note" className={inputClass} placeholder="مثال: الخطأ في سنة الميلاد حسب شهادة الميلاد" />
        </label>
      </div>
      <FormError message={state.error} />
      <div>
        <Submit label="إرسال الطلب للاتحاد" />
      </div>
    </form>
  )
}

export function WithdrawRequest({ request }: { request: string }) {
  const [state, action] = useFormState<RequestState, FormData>(withdrawAthleteRequest, {})
  if (state.ok) return <span className="text-xs text-ws-ok">{state.ok}</span>
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="request" value={request} />
      <button className="text-xs text-ws-muted hover:text-ws-stop">سحب الطلب</button>
      {state.error ? <span className="text-xs text-ws-stop">{state.error}</span> : null}
    </form>
  )
}
