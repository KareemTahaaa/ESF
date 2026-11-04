"use client"

import Link from "next/link"
import { useFormState } from "react-dom"
import { Field, FormError, SubmitButton, inputClass } from "@/components/workspace/form"
import type { Club } from "@/lib/competition/clubs"
import { signUpClub, type FormState } from "../actions"

export function SignupForm({ clubs }: { clubs: readonly Club[] }) {
  const [state, action] = useFormState<FormState, FormData>(signUpClub, {})
  const err = state.fieldErrors ?? {}
  const val = state.values ?? {}

  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      <FormError message={state.error} />

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 text-sm font-semibold text-ws-soft">النادي</legend>
        <Field label="النادي الذي تمثّله" name="clubCode" error={err.clubCode}>
          <select
            id="clubCode"
            name="clubCode"
            defaultValue={val.clubCode ?? ""}
            aria-invalid={Boolean(err.clubCode)}
            className={inputClass}
          >
            <option value="" disabled>
              اختر النادي
            </option>
            {clubs.map((club) => (
              <option key={club.code} value={club.code}>
                {club.nameAr} ({club.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="صفتك في النادي" name="position" error={err.position} hint="مثل: مدير النشاط، مدرب أول، إداري الفريق.">
          <input id="position" name="position" defaultValue={val.position} aria-invalid={Boolean(err.position)} className={inputClass} />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 text-sm font-semibold text-ws-soft">بياناتك</legend>
        <Field label="الاسم الثلاثي" name="fullName" error={err.fullName}>
          <input
            id="fullName"
            name="fullName"
            autoComplete="name"
            defaultValue={val.fullName}
            aria-invalid={Boolean(err.fullName)}
            className={inputClass}
          />
        </Field>
        <Field label="رقم الهاتف" name="phone" error={err.phone}>
          <input
            id="phone"
            name="phone"
            type="tel"
            dir="ltr"
            autoComplete="tel"
            defaultValue={val.phone}
            aria-invalid={Boolean(err.phone)}
            className={`${inputClass} text-left`}
          />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 text-sm font-semibold text-ws-soft">بيانات الدخول</legend>
        <Field label="البريد الإلكتروني" name="email" error={err.email}>
          <input
            id="email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            defaultValue={val.email}
            aria-invalid={Boolean(err.email)}
            className={`${inputClass} text-left`}
          />
        </Field>
        <Field label="كلمة المرور" name="password" error={err.password} hint="10 أحرف على الأقل.">
          <input
            id="password"
            name="password"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            aria-invalid={Boolean(err.password)}
            className={`${inputClass} text-left`}
          />
        </Field>
        <Field label="تأكيد كلمة المرور" name="passwordConfirm" error={err.passwordConfirm}>
          <input
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            aria-invalid={Boolean(err.passwordConfirm)}
            className={`${inputClass} text-left`}
          />
        </Field>
      </fieldset>

      <div className="flex flex-col gap-4">
        <SubmitButton pendingLabel="جارٍ إنشاء الحساب…">إنشاء حساب النادي</SubmitButton>
        <p className="text-center text-sm text-ws-muted">
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="font-medium text-ws-red underline-offset-4 hover:underline">
            سجّل الدخول
          </Link>
        </p>
      </div>
    </form>
  )
}
