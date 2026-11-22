"use client"

import { useFormState } from "react-dom"
import { Field, FormError, FormNotice, SubmitButton, inputClass } from "@/components/workspace/form"
import { requestPasswordReset, type FormState } from "../actions"

export function ForgotPasswordForm() {
  const [state, action] = useFormState<FormState, FormData>(requestPasswordReset, {})

  if (state.notice) return <FormNotice message={state.notice} />

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormError message={state.error} />
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
      <SubmitButton pendingLabel="جارٍ الإرسال…">أرسل رابط إعادة التعيين</SubmitButton>
    </form>
  )
}
