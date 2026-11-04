"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { FormError, inputClass } from "@/components/workspace/form"
import type { Club } from "@/lib/competition/clubs"
import { addAthlete, setAthleteActive, transferAthlete, updateAthlete, type AthleteActionState } from "./actions"

function Button({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "stop" | "red" }) {
  const { pending } = useFormStatus()
  const tones = {
    ink: "bg-ws-ink text-ws-paper",
    red: "bg-ws-red text-white",
    stop: "border border-ws-stop/40 text-ws-stop hover:bg-ws-stop-wash",
  }
  return (
    <button disabled={pending} className={"h-10 rounded-md px-4 text-sm font-semibold hover:opacity-90 disabled:opacity-60 " + tones[tone]}>
      {pending ? "جارٍ الحفظ…" : children}
    </button>
  )
}

function Feedback({ state }: { state: AthleteActionState }) {
  if (state.error) return <FormError message={state.error} />
  if (state.ok) return <p className="text-sm text-ws-ok">{state.ok}</p>
  return null
}

function Label({ text, children, wide }: { text: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={"flex flex-col gap-1.5 text-sm font-medium text-ws-ink " + (wide ? "sm:col-span-2" : "")}>
      {text}
      {children}
    </label>
  )
}

interface Record {
  readonly fullName: string
  readonly birthYear: number | null
  readonly gender: "M" | "F"
  readonly registrationNumber: string | null
}

function RecordFields({ record }: { record?: Record }) {
  return (
    <>
      <Label text="الاسم الكامل" wide>
        <input name="fullName" required defaultValue={record?.fullName} className={inputClass} />
      </Label>
      <Label text="سنة الميلاد">
        <input name="birthYear" inputMode="numeric" maxLength={4} defaultValue={record?.birthYear ?? ""} className={inputClass} />
      </Label>
      <Label text="النوع">
        <select name="gender" required defaultValue={record?.gender ?? ""} className={inputClass}>
          <option value="" disabled>
            اختر
          </option>
          <option value="F">بنات</option>
          <option value="M">بنين</option>
        </select>
      </Label>
      <Label text="رقم التسجيل (اختياري)">
        <input name="registrationNumber" defaultValue={record?.registrationNumber ?? ""} className={inputClass} dir="ltr" />
      </Label>
    </>
  )
}

export function EditAthleteForm({ athlete, record }: { athlete: string; record: Record }) {
  const [state, action] = useFormState<AthleteActionState, FormData>(updateAthlete, {})
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="athlete" value={athlete} />
      <RecordFields record={record} />
      <Label text="سبب التعديل — يُحفظ في السجل" wide>
        <input name="reason" required className={inputClass} placeholder="مثال: شهادة الميلاد وصلت من النادي" />
      </Label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Feedback state={state} />
        <div>
          <Button>حفظ التعديل</Button>
        </div>
      </div>
    </form>
  )
}

export function AddAthleteForm({ clubs, nextNumber }: { clubs: readonly Club[]; nextNumber: number }) {
  const [state, action] = useFormState<AthleteActionState, FormData>(addAthlete, {})
  const duplicate = state.error?.startsWith("Possible duplicate")
  return (
    <form action={action} className="grid gap-4 rounded-md border border-ws-rule bg-ws-raised p-5 sm:grid-cols-2">
      <Label text="رقم الاتحاد">
        <input name="federationNumber" inputMode="numeric" required defaultValue={nextNumber} className={inputClass} />
      </Label>
      <Label text="النادي">
        <select name="club" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            اختر النادي
          </option>
          {clubs.map((c) => (
            <option key={c.code} value={c.code}>
              {c.nameAr} ({c.code})
            </option>
          ))}
        </select>
      </Label>
      <RecordFields />
      <Label text="السبب — يُحفظ في السجل" wide>
        <input name="reason" required className={inputClass} placeholder="مثال: تسجيل جديد بعد استيراد الملف" />
      </Label>
      {duplicate ? (
        <label className="flex items-center gap-2 text-sm text-ws-wait sm:col-span-2">
          <input type="checkbox" name="allowSimilar" value="yes" />
          تأكدت أنه لاعب مختلف عن اللاعب المسجل بنفس الاسم وسنة الميلاد
        </label>
      ) : null}
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Feedback state={state} />
        <div>
          <Button tone="red">إضافة اللاعب</Button>
        </div>
      </div>
    </form>
  )
}

export function TransferForm({ athlete, clubs, current }: { athlete: string; clubs: readonly Club[]; current: string | null }) {
  const [state, action] = useFormState<AthleteActionState, FormData>(transferAthlete, {})
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="athlete" value={athlete} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Label text="النادي الجديد">
          <select name="club" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              اختر
            </option>
            {clubs
              .filter((c) => c.code !== current)
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.nameAr}
                </option>
              ))}
          </select>
        </Label>
        <Label text="السبب">
          <input name="reason" required className={inputClass} />
        </Label>
      </div>
      <Feedback state={state} />
      <div>
        <Button>تسجيل الانتقال</Button>
      </div>
    </form>
  )
}

export function ActiveForm({ athlete, active }: { athlete: string; active: boolean }) {
  const [state, action] = useFormState<AthleteActionState, FormData>(setAthleteActive, {})
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-sm text-ws-muted hover:text-ws-stop">
        {active ? "إيقاف اللاعب…" : "إعادة تفعيل اللاعب…"}
      </button>
    )
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="athlete" value={athlete} />
      <input type="hidden" name="active" value={String(!active)} />
      <Label text="السبب">
        <input name="reason" required className={inputClass} />
      </Label>
      <Feedback state={state} />
      <div>
        <Button tone={active ? "stop" : "ink"}>{active ? "إيقاف" : "إعادة تفعيل"}</Button>
      </div>
    </form>
  )
}
