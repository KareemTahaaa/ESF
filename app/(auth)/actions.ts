"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { DEMO_ROLE_COOKIE, getCurrentAccount, homeFor, safeNextPath } from "@/lib/auth/account"
import { clientAddress, resetLimiter, signInLimiter, signUpLimiter, tooManyAttemptsMessage } from "@/lib/auth/rate-limit"
import { CLUBS, findClub } from "@/lib/competition/clubs"
import { FEDERATION_INBOX, notify } from "@/lib/notify/send"
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface FormState {
  readonly error?: string
  readonly fieldErrors?: Readonly<Record<string, string>>
  readonly values?: Readonly<Record<string, string>>
  /** A confirmation to show in place of the form's error. */
  readonly notice?: string
}

const NOT_CONFIGURED = "تسجيل الدخول غير متاح بعد: لم يتم ربط قاعدة البيانات. تواصل مع الاتحاد."

/** Supabase auth messages, in the interface's own words. */
function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes("invalid login credentials")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة."
  if (m.includes("email not confirmed")) return "أكّد بريدك الإلكتروني أولاً من الرابط الذي أرسلناه إليك."
  if (m.includes("already registered") || m.includes("already been registered"))
    return "هذا البريد مسجّل بالفعل. سجّل الدخول بدلاً من إنشاء حساب جديد."
  if (m.includes("rate limit") || m.includes("too many"))
    return "محاولات كثيرة في وقت قصير. انتظر بضع دقائق ثم حاول مرة أخرى."
  if (m.includes("password")) return "كلمة المرور لا تستوفي الشروط. استخدم 10 أحرف على الأقل."
  return "تعذّر إكمال الطلب. حاول مرة أخرى، وإذا تكرر الخطأ تواصل مع الاتحاد."
}

// ---------------------------------------------------------------------------
// Sign up — a club creates its own account, which stays pending until approved
// ---------------------------------------------------------------------------

const clubCodes = CLUBS.map((c) => c.code) as [string, ...string[]]

const signUpSchema = z.object({
  clubCode: z.enum(clubCodes, { errorMap: () => ({ message: "اختر النادي الذي تمثّله." }) }),
  fullName: z.string().trim().min(5, "اكتب الاسم الثلاثي كاملاً.").max(120),
  position: z.string().trim().min(2, "اكتب صفتك في النادي، مثل مدرب أو مدير النشاط.").max(80),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{10,16}$/, "اكتب رقم هاتف صحيحاً، مثل 01012345678."),
  email: z.string().trim().toLowerCase().email("اكتب بريداً إلكترونياً صحيحاً."),
  password: z.string().min(10, "كلمة المرور يجب ألا تقل عن 10 أحرف.").max(72),
})

export async function signUpClub(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(
    ["clubCode", "fullName", "position", "phone", "email", "password"].map((k) => [k, String(formData.get(k) ?? "")])
  )
  // Never echo the password back into the form.
  const { password: _omit, ...values } = raw

  const parsed = signUpSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0])
      fieldErrors[key] ??= issue.message
    }
    return { fieldErrors, values }
  }

  if (formData.get("password") !== formData.get("passwordConfirm")) {
    return { fieldErrors: { passwordConfirm: "كلمتا المرور غير متطابقتين." }, values }
  }

  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED, values }

  const requestHeaders = await headers()
  const limit = signUpLimiter.attempt([`ip:${clientAddress(requestHeaders)}`])
  if (!limit.allowed) return { error: tooManyAttemptsMessage(limit.retryAfterMs), values }

  const origin = requestHeaders.get("origin") ?? ""
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/pending`,
      // Only a REQUEST. The database ignores this for role and status, and the
      // club is confirmed by a federation admin before it grants any access.
      data: {
        full_name: parsed.data.fullName,
        position: parsed.data.position,
        phone: parsed.data.phone,
        requested_club_code: parsed.data.clubCode,
      },
    },
  })

  if (error) return { error: translateAuthError(error.message), values }

  await notify(async () => ({
    to: [FEDERATION_INBOX],
    notification: {
      kind: "account_requested",
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      clubName: findClub(parsed.data.clubCode)?.nameAr ?? null,
    },
  }))

  redirect(`/signup/check-email?email=${encodeURIComponent(parsed.data.email)}`)
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("اكتب بريداً إلكترونياً صحيحاً."),
  password: z.string().min(1, "اكتب كلمة المرور."),
})

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "")
  const parsed = signInSchema.safeParse({ email, password: String(formData.get("password") ?? "") })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message
    return { fieldErrors, values: { email } }
  }

  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED, values: { email } }

  const emailKey = `email:${parsed.data.email}`
  const limit = signInLimiter.attempt([`ip:${clientAddress(await headers())}`, emailKey])
  if (!limit.allowed) return { error: tooManyAttemptsMessage(limit.retryAfterMs), values: { email } }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: translateAuthError(error.message), values: { email } }
  signInLimiter.reset(emailKey)

  const account = await getCurrentAccount()
  const next = safeNextPath(String(formData.get("next") ?? ""))
  redirect(account && account.status === "approved" && next ? next : account ? homeFor(account) : "/pending")
}

// ---------------------------------------------------------------------------
// Forgotten password — an emailed link signs the person in to /reset-password
// ---------------------------------------------------------------------------

const RESET_SENT =
  "إذا كان هذا البريد مسجّلاً لدينا فستصلك رسالة خلال دقائق فيها رابط لتعيين كلمة مرور جديدة. تحقق من مجلد الرسائل غير المرغوب فيها أيضاً."

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "")
  const parsed = signInSchema.shape.email.safeParse(email)
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0]!.message }, values: { email } }
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED, values: { email } }

  const requestHeaders = await headers()
  const limit = resetLimiter.attempt([`ip:${clientAddress(requestHeaders)}`, `email:${parsed.data}`])
  if (!limit.allowed) return { error: tooManyAttemptsMessage(limit.retryAfterMs), values: { email } }

  const origin = requestHeaders.get("origin") ?? ""
  const supabase = await createSupabaseServerClient()
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })
  // The same answer whether or not the address has an account, so the form
  // cannot be used to find out who is registered.
  return { notice: RESET_SENT }
}

const newPasswordSchema = z.string().min(10, "كلمة المرور يجب ألا تقل عن 10 أحرف.").max(72, "كلمة المرور طويلة جداً.")

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "")
  const parsed = newPasswordSchema.safeParse(password)
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0]!.message } }
  if (password !== formData.get("passwordConfirm")) return { fieldErrors: { passwordConfirm: "كلمتا المرور غير متطابقتين." } }
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED }

  const account = await getCurrentAccount()
  if (!account) redirect("/forgot-password?error=expired")

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data })
  if (error) {
    const m = error.message.toLowerCase()
    if (m.includes("different from the old")) return { fieldErrors: { password: "اختر كلمة مرور مختلفة عن الحالية." } }
    return { error: translateAuthError(error.message) }
  }
  redirect(homeFor(account))
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

export async function signOut(): Promise<void> {
  if (isDemoMode()) {
    ;(await cookies()).delete(DEMO_ROLE_COOKIE)
  } else if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut()
  }
  redirect("/login")
}

// ---------------------------------------------------------------------------
// Demo mode — design review only; inert once Supabase is connected
// ---------------------------------------------------------------------------

export async function enterDemo(formData: FormData): Promise<void> {
  if (!isDemoMode()) redirect("/login")
  const role = String(formData.get("role") ?? "")
  if (!["federation", "club", "pending"].includes(role)) redirect("/login")
  ;(await cookies()).set(DEMO_ROLE_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/" })
  redirect(role === "pending" ? "/pending" : role === "club" ? "/dashboard/club" : "/dashboard/federation")
}
