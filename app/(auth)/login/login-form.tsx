"use client"

import Link from "next/link"
import { useFormState } from "react-dom"
import { Field, FormError, SubmitButton, inputClass } from "@/components/workspace/form"
import { signIn, type FormState } from "../actions"

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useFormState<FormState, FormData>(signIn, {})

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormError message={state.error} />
      <input type="hidden" name="next" value={next ?? ""} />

      <Field label="البريد الإلكتروني" name="email" error={state.fieldErrors?.email}>
        <input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          className={`${inputClass} text-left`}
        />
      </Field>

      <Field label="كلمة المرور" name="password" error={state.fieldErrors?.password}>
        <input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={`${inputClass} text-left`}
        />
      </Field>

      <Link href="/forgot-password" className="-mt-2 self-start text-sm text-ws-muted underline-offset-4 hover:text-ws-ink hover:underline">
        نسيت كلمة المرور؟
      </Link>

      <SubmitButton pendingLabel="جارٍ الدخول…">تسجيل الدخول</SubmitButton>

      <p className="text-center text-sm text-ws-muted">
        ناديك غير مسجّل بعد؟{" "}
        <Link href="/signup" className="font-medium text-ws-red underline-offset-4 hover:underline">
          أنشئ حساب النادي
        </Link>
      </p>
    </form>
  )
}
