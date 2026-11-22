"use client"

import { useFormState } from "react-dom"
import { Field, FormError, SubmitButton, inputClass } from "@/components/workspace/form"
import { updatePassword, type FormState } from "../actions"

export function ResetPasswordForm() {
  const [state, action] = useFormState<FormState, FormData>(updatePassword, {})

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormError message={state.error} />
      <Field label="كلمة المرور الجديدة" name="password" error={state.fieldErrors?.password} hint="10 أحرف على الأقل.">
        <input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={`${inputClass} text-left`}
        />
      </Field>
      <Field label="تأكيد كلمة المرور" name="passwordConfirm" error={state.fieldErrors?.passwordConfirm}>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          aria-invalid={Boolean(state.fieldErrors?.passwordConfirm)}
          className={`${inputClass} text-left`}
        />
      </Field>
      <SubmitButton pendingLabel="جارٍ الحفظ…">حفظ كلمة المرور</SubmitButton>
    </form>
  )
}
