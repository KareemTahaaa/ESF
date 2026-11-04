"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { FormError, SubmitButton, inputClass } from "@/components/workspace/form"
import {
  addCatalogueRow,
  changeRoundStatus,
  createEvent,
  deleteEvent,
  enterAthleteException,
  scheduleRound,
  type ActionState,
} from "./actions"

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <FormError message={state.error} />
  if (state.ok) return <p className="text-sm text-ws-ok">{state.ok}</p>
  return null
}

function SmallButton({
  children,
  tone = "ink",
  name,
  value,
}: {
  children: React.ReactNode
  tone?: "ink" | "ok" | "stop" | "quiet"
  name?: string
  value?: string
}) {
  const { pending } = useFormStatus()
  const tones = {
    ink: "bg-ws-ink text-ws-paper hover:opacity-90",
    ok: "bg-ws-ok text-white hover:opacity-90",
    stop: "border border-ws-stop/40 text-ws-stop hover:bg-ws-stop-wash",
    quiet: "border border-ws-rule text-ws-soft hover:bg-ws-sunk",
  }
  return (
    <button
      name={name}
      value={value}
      disabled={pending}
      className={"h-9 shrink-0 rounded-md px-3 text-sm font-medium disabled:opacity-60 " + tones[tone]}
    >
      {pending ? "…" : children}
    </button>
  )
}

export function CreateEventForm() {
  const [state, action] = useFormState<ActionState, FormData>(createEvent, {})
  return (
    <form action={action} className="grid gap-4 rounded-md border border-ws-rule bg-ws-raised p-5 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ws-ink">
        البطولة
        <select name="championship" defaultValue="" required className={inputClass}>
          <option value="" disabled>
            اختر
          </option>
          <option value="qualifications">جولة التصفيات</option>
          <option value="national_league">الدوري العام</option>
          <option value="egypt_cup">كأس مصر</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ws-ink">
        اسم الفعالية
        <input name="name" required className={inputClass} placeholder="مثال: جولة التصفيات — Track" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ws-ink">
        المكان
        <input name="venue" className={inputClass} placeholder="مثال: مدرسة بن مسعود" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ws-ink">
        التاريخ
        <input name="date" type="date" className={inputClass} />
      </label>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormError message={state.error} />
        <div className="sm:w-48">
          <SubmitButton pendingLabel="جارٍ الإنشاء…">إنشاء الفعالية</SubmitButton>
        </div>
      </div>
    </form>
  )
}

export function AddRowForm({ event, number, longDistance }: { event: string; number: number; longDistance: boolean }) {
  const [state, action] = useFormState<ActionState, FormData>(addCatalogueRow, {})
  if (state.ok) return <p className="text-sm text-ws-ok">{state.ok}</p>
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="number" value={number} />
      {longDistance ? <p className="text-xs text-ws-muted">عمومي، وشباب مع ناشئين مدمجين</p> : null}
      <SmallButton>إضافة</SmallButton>
      {state.error ? <p className="max-w-xs text-xs text-ws-stop">{state.error}</p> : null}
    </form>
  )
}

export function ScheduleForm({
  round,
  deadline,
  scheduled,
}: {
  round: string
  deadline: string | null
  scheduled: string | null
}) {
  const [state, action] = useFormState<ActionState, FormData>(scheduleRound, {})
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="round" value={round} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ws-muted">
          آخر موعد للتسجيل (القاهرة)
          <input name="deadline" type="datetime-local" defaultValue={deadline ?? ""} required className={inputClass + " h-9 w-auto"} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ws-muted">
          موعد السباق
          <input name="scheduled" type="datetime-local" defaultValue={scheduled ?? ""} className={inputClass + " h-9 w-auto"} />
        </label>
        <SmallButton tone="quiet">حفظ الموعد</SmallButton>
      </div>
      <Feedback state={state} />
    </form>
  )
}

const NEEDS_REASON = new Set(["cancelled", "reopen"])

export function StatusForm({ round, transitions }: { round: string; transitions: readonly { to: string; label: string; reopen?: boolean }[] }) {
  const [state, action] = useFormState<ActionState, FormData>(changeRoundStatus, {})
  const [chosen, setChosen] = useState<string | null>(null)
  const needsReason = chosen !== null && NEEDS_REASON.has(chosen)

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="round" value={round} />
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => {
          const key = t.to === "cancelled" ? "cancelled" : t.reopen ? "reopen" : t.to
          if (NEEDS_REASON.has(key) && chosen !== key) {
            return (
              <button
                key={key}
                type="button"
                onClick={() => setChosen(key)}
                className={
                  "h-9 rounded-md px-3 text-sm font-medium " +
                  (key === "cancelled" ? "border border-ws-stop/40 text-ws-stop hover:bg-ws-stop-wash" : "border border-ws-rule text-ws-soft hover:bg-ws-sunk")
                }
              >
                {t.label}
              </button>
            )
          }
          return (
            <SmallButton key={key} name="status" value={t.to} tone={t.to === "cancelled" ? "stop" : "ink"}>
              {NEEDS_REASON.has(key) ? `تأكيد: ${t.label}` : t.label}
            </SmallButton>
          )
        })}
      </div>
      {needsReason ? <input name="reason" required minLength={5} placeholder="السبب — يُحفظ في سجل التدقيق" className={inputClass + " h-9"} /> : null}
      <Feedback state={state} />
    </form>
  )
}

export function ExceptionForm({ round }: { round: string }) {
  const [state, action] = useFormState<ActionState, FormData>(enterAthleteException, {})
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="round" value={round} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ws-muted">
          رقم اللاعب
          <input name="federationNumber" inputMode="numeric" required className={inputClass + " h-9 w-28"} />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ws-muted">
          سبب الإضافة بعد الموعد
          <input name="reason" required className={inputClass + " h-9"} />
        </label>
        <SmallButton tone="quiet">إضافة استثنائية</SmallButton>
      </div>
      <Feedback state={state} />
    </form>
  )
}

/** Two steps, with a reason, because deleting cannot be undone. */
export function DeleteEventForm({ event, name, deletable }: { event: string; name: string; deletable: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const [state, action] = useFormState<ActionState, FormData>(deleteEvent, {})

  if (!deletable) {
    return (
      <p className="text-sm leading-relaxed text-ws-muted">
        لا يمكن حذف هذه الفعالية لأن فيها تسجيلات أو قوائم بدء أو نتائج. لإيقافها ألغِ سباقاتها من الأعلى؛ يبقى سجلها محفوظاً.
      </p>
    )
  }
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-start rounded-md border border-ws-stop/40 px-4 py-2 text-sm font-medium text-ws-stop hover:bg-ws-stop-wash"
      >
        حذف الفعالية
      </button>
    )
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-md bg-ws-stop-wash p-4">
      <input type="hidden" name="event" value={event} />
      <p className="text-sm leading-relaxed text-ws-stop">
        ستُحذف «{name}» وكل سباقاتها نهائياً، ولا يمكن التراجع. يبقى في سجل التدقيق ما حُذف ومن حذفه والسبب.
      </p>
      <label className="flex flex-col gap-1.5 text-sm text-ws-soft">
        سبب الحذف
        <input name="reason" required className={inputClass} placeholder="مثال: فعالية تجريبية" />
      </label>
      <div className="flex gap-2">
        <SmallButton tone="stop">تأكيد الحذف</SmallButton>
        <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-3 py-1.5 text-sm text-ws-muted hover:text-ws-ink">
          إلغاء
        </button>
      </div>
      <Feedback state={state} />
    </form>
  )
}
