# Phase 2 — Repository Audit

Audit date: **2026-10-31**. Baseline commit `6d839a1` ("Fix error in next.config.mjs"), branch `main`, working tree clean.

> No secrets or environment-variable values are reproduced here. Variable **names** only.

---

## 1. Headline findings

| # | Finding | Impact |
|---|---|---|
| 1 | **The launch target is 3 days away** (today 2026-10-31, target 2026-11-03). Phase 2 as specified is a multi-month build. | Scope must be cut to a launch-critical core. See `IMPLEMENTATION_PLAN.md` §1. |
| 2 | **There is no database.** No ORM, no SQL client, no migrations. Content lives in Sanity (hosted headless CMS). | Every Phase 2 entity (athletes, entries, results, points) needs a datastore chosen and provisioned from zero. |
| 3 | **There is no authentication or authorization of any kind.** No auth library, no `middleware.ts`, no session code, no user model. | Federation admin, club admin, and results-official roles are greenfield. |
| 4 | **There is no test framework.** No Jest/Vitest/Playwright, no `test` script, no CI. | The brief's testing requirements start from zero infrastructure. |
| 5 | **The app is public, read-only, Arabic-only.** 16 routes, all marketing/content. The only write path is a contact form. | Phase 2 adds the app's first authenticated, transactional surface. |
| 6 | Pre-existing: **35 TypeScript errors** and lint, both suppressed at build time by `next.config.mjs`. | Build is green but type safety is not enforced. The rules engine must not depend on this suppression. |
| 7 | Recent history contains deliberate sabotage commits (`650c6ee` forced 404s, `2fdf549` infinite redirect loop), **since reverted** by `6d839a1`. | Verified clean: current `next.config.mjs` has no redirects and the production build succeeds. Flagged for awareness only. |

---

## 2. Stack as built

| Concern | Actual |
|---|---|
| Framework | Next.js **15.2.6**, App Router (`app/`), React **18** |
| Language | TypeScript 5, `strict: true` — but `ignoreBuildErrors: true` |
| Styling | Tailwind CSS 3.4.17 + `tailwindcss-animate`; shadcn/ui conventions (`components.json`) |
| UI primitives | Radix UI (26 packages, all pinned to `latest`), `lucide-react`, `sonner`, `vaul`, `cmdk` |
| Content backend | **Sanity v3** (`next-sanity` 9) — project `0ujc3v49`, dataset `production`; Studio mounted in-app at `/sanity` |
| Email | **Resend** 6.9.1 (contact form only) |
| Charts | `recharts` (installed, unused) |
| Forms | `react-hook-form` (installed, barely used) |
| Package manager | **npm** (`package-lock.json`, 795 KB); Vercel installs with `--legacy-peer-deps` |
| Hosting | **Vercel** (`vercel.json`: `framework: nextjs`, `buildCommand: npm run build`) |
| Database | **none** |
| Auth | **none** |
| Tests / CI | **none** |

### 2.1 Dependency risk
Over 30 dependencies are pinned to the literal string `"latest"`, so installs are not reproducible, and `--legacy-peer-deps` is already required to install at all. Phase 2 dependencies must be pinned to exact versions; existing `latest` pins must not be widened further.

---

## 3. Routes and functionality to preserve

All routes verified present in `app/` and confirmed by a successful production build.

| Route | Render | Data source | Preserve |
|---|---|---|---|
| `/` | Static (ISR 60s) | Sanity `homePage`, `heroSlide`, `quote` | Yes |
| `/about` | Static (ISR) | Sanity `about` | Yes |
| `/disciplines`, `/disciplines/[slug]` | Static / dynamic | Sanity `sportDiscipline` | Yes |
| `/events`, `/events/[slug]` | Dynamic | Sanity `event`, `eventsPageSingleton` | Yes |
| `/news`, `/news/[slug]` | Dynamic | Sanity `news`, `newsPage`, `author` | Yes |
| `/regulations` | Static | Sanity `regulations`, `regulationsPage` | Yes |
| `/results` | Static (ISR 60s) | Sanity `result` — **uploaded file downloads only** | Yes — see §3.1 |
| `/contact` | Static | Sanity `contact` | Yes |
| `/api/contact` | Dynamic | Resend send | Yes |
| `/api/disciplines`, `/api/events` | Dynamic | Sanity read | Yes |
| `/sanity/[[...tool]]` | Dynamic (1.61 MB JS) | Sanity Studio | Yes |

### 3.1 `/results` is a file list, not results data
`app/results/page.tsx` renders Sanity `result` documents, each wrapping an uploaded **file asset** with view and download buttons. It holds no athlete, heat, time, or ranking data. Phase 2's published-results surface is therefore **additive**: it need not replace this page, and the existing download workflow keeps working on day one.

### 3.2 Localisation
`app/layout.tsx` hardcodes `<html lang="ar" dir="rtl">`. The site is **Arabic-only with RTL already correct**: no i18n framework, no locale routing, no English variant. The brief's "preserve and improve both Arabic and English" does not apply — there is no English to preserve. New admin screens must therefore be Arabic-first/RTL. Note that the source data mixes Arabic with Latin tokens (`One Lap Road`, `100m`, `Heat 3`, `Lane`), which must render correctly inside RTL containers.

---

## 4. Authentication, authorization, roles — current state

There is **no application-level auth**:

- No auth library in `package.json`; no `middleware.ts`; no session/cookie/JWT handling; no login route; no user model.
- `sanity/access.ts` defines Sanity **Studio** role helpers (14 of the 35 TS errors are its untyped `role` parameters). It governs CMS editor access inside Sanity's own hosted identity system. It is **not** usable as application auth for club admins and cannot enforce per-club row-level isolation.
- The only mutation is `app/api/contact/route.ts` (unauthenticated contact form → Resend).

**Consequence:** federation admin, club admin, results official, and public visitor are all new. Server-side enforcement, club-level data isolation, and the audit trail must be built from scratch — nothing existing can be extended.

---

## 5. Data layer — current state

- `lib/sanity.client.ts` — Sanity client; `projectId`/`dataset`/`apiVersion` read from env with **hardcoded fallbacks** (`0ujc3v49`, `production`, `2024-01-01`). `urlForImage()` degrades through several shapes to `/placeholder.svg`.
- `lib/sanity.queries.ts` — all GROQ reads.
- `lib/mock-data.ts` — mock fixtures and `mockImageMap`; `useMockData()` returns true only when `projectId` is empty.
- `sanity/schema/*.ts` — 16 content schemas: `about`, `author`, `blockContent`, `contact`, `event`, `eventsPageSingleton`, `heroSlide`, `homePage`, `news`, `newsPage`, `quote`, `regulations`, `regulationsPage`, `result`, `siteSettings`, `socialMediaLinks`, `sportDiscipline`.
- `schemas/index.ts` (repo root) is **stale and orphaned**: it imports named exports and modules that no longer exist (`category`, `eventsPage`), accounting for 15 of the 35 TS errors. The live index is `sanity/schema/index.ts`. Safe to delete, but left untouched to keep this audit non-destructive.

### 5.1 Sanity is the wrong store for Phase 2 competition data
Sanity is a document CMS built for editorial content. Phase 2 requires multi-row transactions (import commits, results approval), uniqueness and referential-integrity constraints, per-club row-level authorization, and deterministic recalculation over 777 athletes and ~3.5 k results growing every round. Sanity offers no transactions, no foreign keys, and no SQL aggregation.

**Recommendation:** keep Sanity for public editorial content (do not migrate it) and add **Postgres** for competition data. This is an addition, not a replacement, and it satisfies the brief's "no second ORM/database without a strong documented reason" — the reason is transactional integrity and row-level isolation, neither of which Sanity provides. Options and trade-offs: `IMPLEMENTATION_PLAN.md` §3.

---

## 6. Environment and deployment

Required variable **names** (no values):

| Name | Used in | Present locally |
|---|---|---|
| `RESEND_API_KEY` | `app/api/contact/route.ts` | yes (`.env.local`) |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | `lib/sanity.client.ts` | no — hardcoded fallback |
| `NEXT_PUBLIC_SANITY_DATASET` | `lib/sanity.client.ts` | no — falls back to `production` |
| `NEXT_PUBLIC_SANITY_API_VERSION` | `lib/sanity.client.ts` | no — falls back to `2024-01-01` |
| `SANITY_API_READ_TOKEN` | `lib/sanity.client.ts` | no — falls back to `""` |

`.env.local` is correctly git-ignored; `.gitignore` covers `.env*`, `node_modules`, `.next`.

**Repository hygiene** (tracked artifacts that should not be):
`.DS_Store` (root and `app/`), `build_log.txt`, `build_log_2.txt`, `tsconfig.tsbuildinfo` (277 KB), `sanity/dist/`, `sanity/node_modules/.sanity/`, and **duplicate configs**: `postcss.config.js` *and* `postcss.config.mjs`, `tailwind.config.js` *and* `tailwind.config.ts`. The duplicate Tailwind/PostCSS configs are a live hazard — which file wins depends on resolution order, so an edit to the wrong one silently no-ops.

No CI/CD: no `.github/`, no workflows, no hooks.

---

## 7. Verification commands actually run

| Command | Result |
|---|---|
| `npm run build` | **exit 0** — 16 routes compiled, 10 static pages generated |
| `npx tsc --noEmit` | **exit 1** — 35 pre-existing errors: 15 `schemas/index.ts`, 14 `sanity/access.ts`, 6 across `app/news/[slug]`, `lib/sanity.queries.ts`, `components/news-grid.tsx`, `components/discipline-regulations.tsx` |
| `npx tsc --noEmit` *(after a build regenerates `.next/types`)* | **exit 1** — the same 35, **plus 5 newly surfaced**: see §7.1 |
| `npm run lint` | not run — `next lint` is deprecated in Next 15 and is suppressed at build time regardless |
| tests | **none exist** — no test script, no runner |

The build passing while `tsc` fails is expected: `next.config.mjs` sets both `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` to `true`.

### 7.1 Latent Next 15 async-`params` defect in existing pages

`tsconfig.json` includes `.next/types/**/*.ts`. Those files are generated by the build, and the copy committed to the working tree was stale, so running a build surfaces **5 additional** pre-existing errors:

```
.next/types/app/disciplines/[slug]/page.ts  Type '{ params: { slug: string; } }' does not satisfy 'PageProps'
.next/types/app/events/[slug]/page.ts       (same)
.next/types/app/news/[slug]/page.ts         (same)
.next/types/app/events/page.ts              Type '{ searchParams?: {...} }' does not satisfy 'PageProps'
.next/types/app/news/page.ts                (same)
```

In Next 15, `params` and `searchParams` are **Promises**, but these five pages type them as plain objects. The pages work at runtime because Next still passes a thenable and the code does not await, so property access happens to resolve — but this is unsupported and will break on a Next upgrade. It is masked today only by `ignoreBuildErrors`.

**Pre-existing, not introduced by Phase 2.** Logged as a separate cleanup; fixing it is unrelated refactoring and is out of scope for this stage. The error count excluding generated `.next/types` files is **34 lines / 35 errors — unchanged** by Phase 2 work.

---

## 8. What must not break

1. All 16 routes above, including the Sanity Studio mount at `/sanity`.
2. The Sanity read path and its hardcoded project-ID fallbacks — removing them breaks local and preview builds that lack env vars.
3. The contact form → Resend flow.
4. `lang="ar" dir="rtl"` and the beIN font setup (`app/fonts.ts`).
5. The `/results` file-download page and its Sanity `result` documents.
6. The Vercel build path (`npm install --legacy-peer-deps` → `npm run build`).
7. ISR revalidation on `/`, `/about`, `/disciplines`, `/results`.
