# Supabase Setup

Steps to connect the federation and club workspace once the Supabase project exists. Until then the site builds and runs normally; the workspace shows a "not connected" message, or sample data in demo mode.

## 1. Create the project

Create a Supabase project (region nearest Egypt: `eu-central-1` Frankfurt is a sensible default). Record who owns the account — that person holds the athlete data and backups after handover.

Creating it through the **Vercel Marketplace** (Supabase integration) is the least effort: it adds the environment variables to the Vercel project automatically.

## 2. Apply the migrations

**Status:** 0009 was applied on 2026-11-03 (verified: the new registration rules are in `set_round_status`, `check_entry`, `submit_race_entries`, `federation_enter_athlete` and `publish_start_list`; none is callable while signed out; the internal `takes_qualified_entries` and `check_entry` are not callable by signed-in users; 20 tables, all with RLS; the security advisor lists only the intended lint 0029 entries and leaked-password protection, which is a paid-plan Auth setting). 0008 was applied on 2026-11-02 (verified: `start_list_lanes.club_code` is required, the new `publish_start_list`/`save_results`/guard are in place, neither function is callable while signed out, 20 tables all with RLS, no new security-advisor findings). 0001–0007 were applied to project `esf` (`iltxngwesrepcdupuwma`) on 2026-11-01. Verified after applying: 20 tables, every one with RLS; no security-definer function callable while signed out, and none of the internal helpers (`apply_athlete_update`, `create_athlete`, `results_move_round`, `live_result_set`) callable by signed-in users. The remaining security-advisor notes (lint 0029) list the functions signed-in users can call — intended: each checks the caller's role itself. Performance notes (unindexed foreign keys, multiple permissive SELECT policies) do not matter at the federation's data size.

Run each file **in order**, once, in the Supabase dashboard → **SQL Editor**:

| File | Creates |
|---|---|
| `supabase/migrations/0001_accounts.sql` | `clubs` (13 seeded), `profiles`, `audit_log`, signup trigger, `review_club_account`, RLS |
| `supabase/migrations/0002_competition.sql` | seasons and 2026-27 age categories, athletes, club memberships, previous-season rankings, historical results, import batches/rows, events, rounds, prerequisites, race entries, and every function that writes them; RLS |
| `supabase/migrations/0003_start_lists.sql` | versioned published start lists, `publish_start_list`, the guard that stops a round skipping start-list publication; RLS |
| `supabase/migrations/0004_function_grants.sql` | removes signed-out (`anon`) execute rights from the security-definer helpers (Supabase security advisor lint 0028) |
| `supabase/migrations/0005_athlete_management.sql` | federation edit / add / transfer / deactivate of one athlete (reason required, audited before→after); club requests for corrections and new athletes, applied only on federation approval |
| `supabase/migrations/0006_results.sql` | result sets and lines; save → submit → approve → publish; correction as a new version that flags later rounds for review; a round can no longer be marked completed without approved results; published results readable publicly |
| `supabase/migrations/0007_require_reason_search_path.sql` | pins the search path of `require_reason()` (security advisor lint 0011) |
| `supabase/migrations/0008_advancement_start_lists.sql` | start lists for rounds fed by earlier rounds (R16/R24, QF, SF, finals, level B): published only from the current approved prerequisite results; club recorded per start-list lane so results save without club entries; every round needs a published list to run; re-publish after an upstream correction clears the review flag |
| `supabase/migrations/0009_qualified_registration.sql` | Q12: clubs register qualified athletes for the first League/Cup round (only athletes in the approved Qualification results); level B uses the level A round's entries; start lists refuse unregistered athletes and level B waits for level A registration to close; `qualified_club_athletes()` lists a club's own qualifiers. |
| `supabase/migrations/0010_delete_event.sql` | `delete_event(event, reason)`: a federation admin deletes an event set up by mistake, with its rounds, only while it has no entries (even withdrawn), start lists or results and no race elsewhere depends on it; the audit log keeps what was deleted and why. Applied 2026-11-04 (not callable while signed out). |

Or, with the Supabase CLI: `supabase link` then `supabase db push`.

Every migration is also run automatically by the test suite (`npm test`) in an in-process Postgres, with Row Level Security in force, so a migration that fails or a policy that leaks fails the tests before it reaches the real project.

## 3. Auth settings

Dashboard → **Authentication → Providers → Email**:

| Setting | Value | Why |
|---|---|---|
| Enable email signup | **On** | Clubs create their own accounts. |
| Confirm email | **On** | An account must prove it controls its email address. |
| Minimum password length | **10** | Matches the signup form. |

Dashboard → **Authentication → URL Configuration**:

| Setting | Value |
|---|---|
| Site URL | the production URL, e.g. `https://<domain>` |
| Redirect URLs | `https://<domain>/auth/callback`, plus `http://localhost:3000/auth/callback` (and `:3006` if that is the port used) for development |

The same callback serves the password-reset email (`/forgot-password` → link → `/reset-password`), so no extra URL is needed for it. If a redirect URL is missing, Supabase sends the link to the Site URL instead and the reset page reports the link as expired.

Recommended hardening, same dashboard:

| Where | Setting | Why |
|---|---|---|
| Authentication → Attack Protection | **Enable CAPTCHA protection** (Cloudflare Turnstile) | The site's own attempt limits (`lib/auth/rate-limit.ts`) are per server instance; CAPTCHA stops automated guessing everywhere. Needs a site key added to the sign-in and sign-up forms. |
| Authentication → Attack Protection | **Prevent use of leaked passwords** (paid plans) | Refuses passwords known from data breaches. |
| Authentication → Sessions | **Inactivity timeout**, e.g. 8 hours (paid plans) | A forgotten open session on a shared club computer expires. |
| Authentication → Emails → SMTP | **Custom SMTP** (e.g. the federation's mail server) | Supabase's built-in sender is limited to a few emails per hour, which confirmation and reset emails will exceed once clubs sign up. |

Signup being open is safe because a new account is inert: it is created as a **pending** club admin with **no club**, and sees nothing until a federation admin approves it. Role and status are never taken from signup data.

## 4. Environment variables

Set in Vercel (Production and Preview) and in `.env.local` for development:

| Name | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → Data API → Project URL (`https://<ref>.supabase.co`). **Not** the dashboard address `https://supabase.com/dashboard/project/<ref>` — that returns the dashboard's HTML and every request fails. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → **Publishable key** (`sb_publishable_…`) |

Older projects show a legacy `anon` `public` key instead; it can be set as `NEXT_PUBLIC_SUPABASE_ANON_KEY` and works the same way.

The **secret key** (`sb_secret_…`, or legacy `service_role`) is **not** used by the website and must never be added to it, shared in screenshots, or committed. It bypasses Row Level Security entirely. If it is ever exposed, create a new secret key and delete the old one.

### Notification emails

The platform emails people when something needs them (code: `lib/notify/`). It uses Resend, the same service as the website's contact form. Emails go out after the action is saved; if sending fails, the action still succeeds and the error is only logged.

| Name | Value |
|---|---|
| `RESEND_API_KEY` | Already used by the contact form. Without it nothing is sent. |
| `NOTIFY_FROM_EMAIL` | The sender, e.g. `الاتحاد المصري للتزلج <no-reply@egyptskate.org>`. The domain must be **verified in Resend** (Resend → Domains → add the DNS records). Until then the default `onboarding@resend.dev` sender can only deliver to the Resend account's own address, so clubs will not receive anything. |
| `FEDERATION_NOTIFY_EMAIL` | Where federation notifications go. Defaults to `secretariat@egyptskate.org`. |
| `SITE_URL` | The public address used in email links, e.g. `https://egyptskate.org`. Defaults to the address of the request. |

Who is emailed, and when:

| When | Who |
|---|---|
| A club creates an account | the federation inbox |
| An account is approved, rejected or suspended | that account |
| A club sends a player request | the federation inbox |
| A player request is approved or rejected | that club's approved admins |
| A round opens for registration | every approved club admin (with the deadline, in Cairo time) |
| A start list is published or replaced | admins of the clubs on the list |
| Results are sent for approval | the federation inbox |
| Results are published | admins of the clubs in the round |
| A round is cancelled | admins of the clubs entered in it |

Each recipient gets their own email, so clubs never see each other's addresses. The same verified domain can serve as Supabase's custom SMTP sender (Resend provides SMTP credentials), which also lifts Supabase's limit on confirmation and password-reset emails.

Remove `ESF_DEMO_MODE` if it was set. Demo mode switches itself off once the Supabase variables exist, but it should not be left configured.

Redeploy after setting the variables.

## 5. Create the first federation admin

Federation accounts are never created through public signup. To create the first one:

1. The federation admin signs up at `/signup` like a club would (choose any club — it is overwritten below) and confirms their email.
2. In the SQL Editor, promote them:

```sql
update public.profiles
set role = 'federation_admin', status = 'approved', club_id = null, requested_club_id = null
where email = 'admin-email@example.org';
```

3. They sign in and land on `/dashboard/federation`. From then on, club accounts are approved from **حسابات الأندية** in the dashboard, not in SQL.

Promotion through SQL is deliberately the only path to a federation role: the website offers no way to grant it.

## 6. Check it works

1. Sign up a test club account → confirm the email → it lands on the pending screen.
2. Sign in as the federation admin → **حسابات الأندية** shows the request → approve it, linking the club.
3. Sign back in as the club account → it lands on the club dashboard.
4. In the SQL Editor, `select * from audit_log;` shows the approval with who made it and when.
5. While signed in as the club account, open `/dashboard/federation` → it must redirect to `/dashboard/club`.
6. As the federation admin, **استيراد البيانات** → upload `Egypt Skate Database.xlsm` as **سجل اللاعبين**. The preview must show 777 rows: 623 accepted, 16 with a note (no birth year), 138 needing review (Cup 800/1000m ranks), 0 rejected. Commit it.
7. Upload the same file again as **النتائج السابقة**: 3476 rows, 3474 accepted, 2 with a note (FS, DQ), 0 rejected. Commit it. Uploading either file a second time must be refused as already imported.
8. **الفعاليات والسباقات** → create a Qualifications event → add catalogue row 4 (100m) → set a deadline → open registration.
9. As the club account, **التسجيل في السباقات** shows only that club's athletes, and only those eligible; enter two. The federation's event page shows them.
10. Close registration → **قائمة البدء** → check the preview → publish. Download the start list and score sheet.

## Demo mode, for design review before Supabase exists

```
ESF_DEMO_MODE=1 npm run dev
```

The login page then offers three sample views: federation, club, and a pending account. Sample names are marked «مثال», and nothing is saved.
