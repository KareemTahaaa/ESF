"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { FormError, inputClass } from "@/components/workspace/form"
import { reviewAthleteRequest, type ReviewState } from "./actions"

function Button({ decision }: { decision: "approve" | "reject" }) {
  const { pending } = useFormStatus()
  return (
    <button
      disabled={pending}
      className={
        "h-10 rounded-md px-4 text-sm font-semibold disabled:opacity-60 " +
        (decision === "approve" ? "bg-ws-ok text-white hover:opacity-90" : "border border-ws-stop/40 text-ws-stop hover:bg-ws-stop-wash")
      }
    >
      {pending ? "جارٍ الحفظ…" : decision === "approve" ? "موافقة وتطبيق" : "رفض الطلب"}
    </button>
  )
}

export interface ReviewValues {
  readonly fullName: string
  readonly birthYear: number | null
  readonly gender: "M" | "F" | null
  readonly registrationNumber: string | null
}

export function ReviewForm({
  request,
  kind,
  values,
  nextNumber,
}: {
  request: string
  kind: "new_athlete" | "correction"
  values: ReviewValues
  nextNumber: number
}) {
  const [state, action] = useFormState<ReviewState, FormData>(reviewAthleteRequest, {})
  const [decision, setDecision] = useState<"approve" | "reject">("approve")
  if (state.ok) return <p className="rounded-md bg-ws-ok-wash px-4 py-3 text-sm text-ws-ok">{state.ok}</p>
  const duplicate = state.error?.startsWith("Possible duplicate")

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md bg-ws-sunk p-4">
      <input type="hidden" name="request" value={request} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="decision" value={decision} />
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
            aria-checked={decision === value}
            onClick={() => setDecision(value)}
            className={"rounded px-3 py-1.5 text-sm " + (decision === value ? "bg-ws-ink font-medium text-ws-paper" : "text-ws-muted")}
          >
            {label}
          </button>
        ))}
      </div>

      {decision === "approve" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="text-xs text-ws-muted sm:col-span-2">القيم المقترحة من النادي — يمكنك تعديلها قبل الموافقة.</p>
          {kind === "new_athlete" ? (
            <label className="flex flex-col gap-1 text-sm text-ws-ink">
              رقم الاتحاد
              <input name="federationNumber" required inputMode="numeric" defaultValue={nextNumber} className={inputClass} />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm text-ws-ink sm:col-span-2">
            الاسم الكامل
            <input name="fullName" defaultValue={values.fullName} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ws-ink">
            سنة الميلاد
            <input name="birthYear" inputMode="numeric" maxLength={4} defaultValue={values.birthYear ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ws-ink">
            النوع
            <select name="gender" defaultValue={values.gender ?? ""} className={inputClass}>
              <option value="">بدون تغيير</option>
              <option value="F">بنات</option>
              <option value="M">بنين</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-ws-ink">
            رقم التسجيل
            <input name="registrationNumber" defaultValue={values.registrationNumber ?? ""} dir="ltr" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ws-ink sm:col-span-2">
            ملاحظة (اختيارية، تُحفظ في السجل)
            <input name="note" className={inputClass} />
          </label>
          {duplicate ? (
            <label className="flex items-center gap-2 text-sm text-ws-wait sm:col-span-2">
              <input type="checkbox" name="allowSimilar" value="yes" />
              تأكدت أنه لاعب مختلف عن المسجل بنفس الاسم وسنة الميلاد
            </label>
          ) : null}
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-sm text-ws-ink">
          سبب الرفض — يظهر للنادي
          <input name="note" required className={inputClass} />
        </label>
      )}
      <FormError message={state.error} />
      <div>
        <Button decision={decision} />
      </div>
    </form>
  )
}
