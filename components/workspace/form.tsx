"use client"

import { useFormStatus } from "react-dom"
import { cn } from "@/lib/utils"

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string
  name: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ws-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-sm text-ws-stop">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-sm text-ws-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export const inputClass =
  "h-11 w-full rounded-md border border-ws-rule bg-ws-raised px-3 text-[0.95rem] text-ws-ink placeholder:text-ws-muted/70 " +
  "focus:border-ws-ink focus:outline-none aria-[invalid=true]:border-ws-stop"

export function SubmitButton({ children, pendingLabel }: { children: React.ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center rounded-md bg-ws-red px-5 font-semibold text-white transition-opacity",
        "hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      )}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-md border border-ws-stop/30 bg-ws-stop-wash px-4 py-3 text-sm text-ws-stop">
      {message}
    </div>
  )
}

export function FormNotice({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div role="status" className="rounded-md border border-ws-ok/30 bg-ws-ok-wash px-4 py-3 text-sm leading-relaxed text-ws-ok">
      {message}
    </div>
  )
}
