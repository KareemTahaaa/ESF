# Phase 2 — Implementation Plan

Written **2026-10-31**. Read `REPOSITORY_AUDIT.md` first.

---

## 0. Status — 2026-11-01

Verified on this date: `npm test` **334 passed, 12 skipped** (the skipped ones need the real workbook locally; run with it they pass — see below); `npm run build` succeeds; `tsc -p tsconfig.rules.json` (strict, `noUncheckedIndexedAccess`) clean over `lib/competition`, `lib/workspace` and `supabase/tests`.

| Stage | State | Evidence |
|---|---|---|
| 1 Rules engine | Done | 230 rule tests; reproduces the federation's `المرحلة 2026-2027` column for all 761 athletes with a birth year (0 mismatches) |
| 2 Remaining rules | Partly: club standings, points done; points-race / elimination progression not built | — |
| 3 Data model | **Done** — `0002_competition.sql`, `0003_start_lists.sql` | SQL tests run the real migrations in PGlite with RLS in force (`supabase/tests/`) |
| 4 Roles, isolation, audit | **Done** for accounts, imports, events, entries, start lists | Cross-club reads and writes refused by test; tests were checked to FAIL when a policy is weakened |
| 5 Import pipeline | **Done** — preview → validate → authorised commit, SHA-256 duplicate refusal, update-by-federation-number, transfers, replace-on-reimport for results | Real workbook: 777 athletes (623 / 16 / 138 / 0 rejected) and 3476 results (3474 / 2 / 0 rejected); every time equals the openpyxl parse |
| 6 Season, catalogue, events, prerequisites | **Done** — 24 catalogue rows expand to their rounds; prerequisites resolved across events; cycles refused; activation blocked with the missing round named | `rounds.test.ts`, SQL tests |
| 7 Club registration with deadlines | **Done** — own roster only, eligibility per distance, multi-distance, duplicates refused, deadline enforced in the database, audited federation exception | SQL tests |
| 8 Start lists + score sheets | **Done.** Registration rounds (qualification, long distance): seeded from previous-season NL rank at the distance, unranked last; versioned publish that must match the entries exactly. Rounds fed by earlier rounds (R16, QF, SF, finals A/B, level B, 200m final): generated from the prerequisite's approved results by the bracket rules (`lib/competition/advancement.ts`), heats matching the regulations' nested tables; the database refuses a list built from results that are not the current approved ones, or naming anyone who did not race in them (migration 0008). Excel in the template layout. 800/1000m R24 stays unofficial (Q1); Q12 promotion of level-B athletes is not handled — every qualifier is assumed to take part | Structural check against the supplied score-sheet template passes; `advancement.test.ts` (logic and SQL) |
| 9 Results entry / approval / publication | **Done for registration rounds** (qualification, long distance): manual entry or upload of the filled score sheet, save → submit → approve → publish, return with reason, correction as a new version that flags later rounds; who goes through from each round shown from the catalogue rule, unofficial while Q3/Q6 apply | `results.test.ts` (SQL and logic) |
| 10 Points and standings surfaces | Engine only (`points.ts`, `club-standings.ts`); no storage or UI | — |
| 11 Dashboards | Federation: import, players (search, edit, add, transfer, deactivate, history), club requests, events/rounds, start lists, results. Club: roster, race entries, player requests. Standings not built | — |
| — Athlete management | **Done** — `0005_athlete_management.sql`: federation edits with reason and before/after audit; clubs propose corrections and new athletes, applied only on federation approval | `athletes.test.ts` |
| 12 E2E, deployment, handover | Not done | — |

**Live Supabase project (2026-11-01):** migrations 0001-0007 applied to `esf`; 0008 applied 2026-11-02. Verified live: 17 tables all with RLS, 13 clubs, two seasons, the age categories return the right category for every birth year 2007-2020; as a signed-out visitor the API returns clubs and seasons, returns nothing from athletes, profiles, entries or imports, and refuses the admin functions. The app against the live project: unauthenticated `/dashboard/*` redirects to login; login and signup render; no server errors. **Not yet exercised live:** any signed-in flow — that needs the first federation admin account (`SUPABASE_SETUP.md` §5) and then the checklist in §6.

**Round status guard (closed by 0006):** a round now reaches `results_submitted` and `completed` only through the results functions; `completed` requires an approved result set.

Engine fix made in this stage: `generateHeats` now uses the capacity-aware fill for size-driven rounds, matching the documented Q4 default (10 athletes at 4 per heat → 4, 3, 3, short heats at the slow end). It previously used plain serpentine, which put the extra athlete in the last heat.

To run the real-data checks locally (files are personal data and never committed):

```
python docs/scripts/extract-legacy-verification.py "<Egypt Skate Database.xlsm>" <scratch>/legacy.json
LEGACY_VERIFY_JSON=<scratch>/legacy.json LEGACY_WORKBOOK="<Egypt Skate Database.xlsm>" SCORE_SHEET_TEMPLATE="<Score Sheets ….xlsx>" npm test
```

---

## 1. The deadline problem, stated plainly

**Today is 2026-10-31. The stated launch target is 2026-11-03 — three days away.**

The audit establishes what the baseline actually is: a public, read-only, Arabic marketing site with **no database, no authentication, no authorization, and no test framework**. Phase 2 as specified requires all four of those, plus an import pipeline, a rules engine, a results approval workflow, points and standings, document generation, dashboards for three roles, and unit, integration and end-to-end test suites.

That is a multi-month build for a team. It cannot be delivered, let alone tested, in three days. Delivering a partial version of it by 3 November would be worse than delivering nothing, because the system's whole purpose is to produce **official** sporting results — start lists that determine who skates in which lane, and points that determine who wins a championship. A plausible-looking but unverified rules engine will silently produce wrong results that officials will act on.

The brief anticipates this and gives the instruction to follow: *"If time is insufficient, identify the minimum launch-critical workflow, defer optional UI polish, and clearly document anything not ready for official use."* It also sets the completion bar: *"Do not claim the system is complete merely because it compiles."*

So this plan does three things:
1. Delivers, now, the work that is launch-critical under **every** scenario and cannot be invalidated by later decisions (§2).
2. Lays out the real sequence and honest effort for the rest (§4).
3. Names the decisions only the federation can make (§3), because two of them block everything downstream.

### 1.1 What 3 November can realistically be

| Option | Deliverable by 3 Nov | Risk |
|---|---|---|
| **A — Rules engine + verified migration (recommended)** | The deterministic rules engine with full test coverage, and a repeatable, verified import of the 777 athletes / 3476 results. No public surface changes. The existing site stays exactly as it is. | Low. No user-facing risk; the existing site is untouched. Produces the foundation every later stage needs, and immediately proves the rules against real federation data. |
| **B — Full MVP** | Not achievable. | Would ship unverified sporting calculations into official use. |
| **C — Date slips, full MVP built properly** | Nothing on 3 Nov; a tested MVP in 6–8 weeks. | The 2026-27 season timetable may not allow a slip — a federation decision, not an engineering one. |

**Recommendation: A, then C.** Option A is what this milestone begins, because it is correct under A and is also the mandatory first stage of C. Nothing in it is wasted work, and none of it depends on the open decisions in §3.

**What A explicitly does not deliver by 3 November:** club login, race registration, start-list generation in the product, results entry, approval and publication, points and standings surfaces, dashboards, and document export. Those are stages 3–11 in §4. Until they exist, the federation continues to run the season on the existing Excel workbooks, which keep working untouched.

---

## 2. Stage 1 — in progress now: the deterministic rules engine

Chosen because it is the one body of work that is **launch-critical, fully specified, verifiable today, and immune to every open decision**. It needs no database, no auth, no hosting choice, and no federation answer to start. Whatever is decided in §3, these functions are needed and are unchanged by it.

Location: `lib/competition/rules/` — pure TypeScript. Every function is a pure function of its inputs, taking an explicit `rulesetVersion`: no database access, no randomness, no clock reads. That is what makes recalculation reproducible and keeps a future rule change from silently altering a past season's published results.

| Module | Rule source | Status |
|---|---|---|
| `age-category.ts` | Article 3 (fully specified) | Build + test now |
| `points.ts` | Article 5 (fully specified; tie-consumption Q6) | Build + test now |
| `eligibility.ts` | Article 7 (specified; long-distance categories Q11) | Build + test now |
| `time.ts` | Migration §4.1 — 11 legacy time formats | Build + test now |
| `seeding.ts` | Article 9 Table 9 (unranked placement Q7) | Build + test now |
| `heats.ts` | Article 9 Table 9 (remainder Q4) | Build + test now |
| `progression/sprint-100m.ts` | Tables 10/12 r1 + nested (fully specified) | Build + test now |
| `progression/four-lane.ts` | Tables 10 r2 / 11 r2 (fully specified) | Build + test now |
| `progression/time-trial.ts` | Table 11 r1 (fully specified) | Build + test now |
| `progression/middle-distance.ts` | Table 11 r3 | **Blocked — Q1**; membership only, official output refused |
| `progression/points-race.ts` | Article 9 (fully specified) | Stage 2 |
| `progression/elimination.ts` | Article 9 (schedule is operator input, Q13) | Stage 2 |
| `club-standings.ts` | Article 8 (fully specified) | Stage 2 |
| `prerequisites.ts` | Catalogue chains (fully specified) | Stage 2 |

**Test framework:** Vitest, pinned exactly. Chosen over Jest because it needs no Babel/SWC configuration against this Next 15 + TS setup, and over Playwright because stage 1 has no browser surface. This is the repository's first test infrastructure, so it must not disturb the existing build: tests live outside `app/`, and `npm run build` is unaffected.

**Type safety:** the rules engine is held to `strict` TypeScript with **no** reliance on the repo-wide `ignoreBuildErrors`. A separate `tsconfig.rules.json` typechecks `lib/competition/**` cleanly, so the 35 pre-existing errors elsewhere neither mask nor block new work.

**The acceptance bar for stage 1** is not that it compiles. It is:
1. Every birth-year boundary in Article 3 covered by a test.
2. Applying `age-category.ts` to all 777 real athlete rows reproduces the federation's own `المرحلة 2026-2027` column with **0 mismatches** (761 rows with a birth year; 16 correctly reported as unresolved).
3. All 3476 real `Records` times either parse to an exact expected value or are explicitly rejected with a reason — **zero silent coercions**.
4. Every seeding and bracket pattern transcribed in `RULE_MATRIX.md` §8 reproduced exactly by a test.
5. Every blocked rule (Q1, Q10) proven by test to **refuse** rather than guess.

---

## 3. Decisions required from the federation

Two block downstream work. The rest can be answered while building.

### 3.1 DECIDED (2026-10-31) — Supabase for database and auth

**Decision: Supabase.** This supersedes the earlier Neon + Auth.js recommendation and resolves both blocking decisions in a single provisioning step.

Assessment — Supabase is a better fit than the original recommendation for this project:

- **It is Postgres.** Every reason Sanity was rejected in `REPOSITORY_AUDIT.md` §5.1 (transactions, foreign keys, uniqueness constraints, SQL aggregation) is satisfied.
- **Auth is bundled**, collapsing §3.1 and §3.2 into one decision and removing a whole workstream (password hashing, reset, lockout) from the 10-day window.
- **Row Level Security directly serves a hard requirement.** The brief demands that club users cannot reach another club's data by changing a URL or a request identifier. RLS enforces that *in the database*, which is strictly stronger than application-layer checks and cannot be bypassed by a missed `where` clause in a query.
- **Storage is included**, which the migration pipeline needs to retain original source workbooks unmodified (`DATA_MIGRATION_MAP.md` §7).

**Stack:**
- **Supabase Postgres** — competition data.
- **Plain SQL migrations** in `supabase/migrations/` (Supabase CLI convention) — reviewable and version-controlled, which the brief's "avoid destructive migrations" requirement depends on. *Revised 2026-11-01:* Drizzle was dropped as an extra layer the workspace does not need; RLS policies and security-definer functions are written in SQL either way.
- **`@supabase/ssr`** — auth and RLS-scoped reads in the App Router.
- **Sanity is kept** for editorial content and is not migrated.

**Four risks this design must handle explicitly — none of them optional:**

1. **The service-role key bypasses RLS entirely.** Import, migration, and federation-admin paths that need cross-club access must therefore carry their own authorization checks in application code. RLS is a second line of defence, never the only gate. Server-side validation of every mutation is still required, exactly as the brief states.
2. **RLS policies need their own tests.** A policy that is subtly too permissive is invisible until it leaks. Club-isolation tests must attempt cross-club access as a club user and assert refusal, rather than only asserting that correct access works.
3. **Self-registered accounts must be inert until approved.** *Revised 2026-11-01: clubs create their own accounts.* Signup is therefore open, so a new account is created as a pending club admin with no club and can see nothing until a federation admin approves it and confirms its club. Role and status come only from column defaults, never from signup data the user controls. Federation roles cannot be granted from the website at all. See `supabase/migrations/0001_accounts.sql` and `SUPABASE_SETUP.md`.
4. **Serverless connection pooling.** Vercel Functions must use the pooled connection string (Supavisor), not the direct Postgres connection, or the function will exhaust connections under load.

**Still needed from the federation:** who owns the Supabase project and its backups, and confirmation of how a club admin is identified (named person per club, or a shared club account).

### 3.2 Revised timeline — 10 November

The target was moved from 3 November to **10 November 2026** and the full scope was reaffirmed. Recorded for the avoidance of doubt: 10 days is below the 10–13 weeks §4 estimates for the complete scope, so work proceeds in launch-critical order and each stage reports honestly what is production-ready and what is not. Nothing is marked complete merely because it compiles.

Supabase removes roughly a week from the original estimate by eliminating the separate auth build and by letting club isolation be enforced declaratively.

### 3.3 Non-blocking but needed soon
The 15 sporting-rule questions in `../rules/OPEN_QUESTIONS.md`. **Q1** (800/1000m seeding), **Q14** (16 missing birth years), and **Q2** (138 corrupt Cup rankings) are the ones that block official output for real races in the catalogue. Q14 is the cheapest to resolve and should be sent first — it is 16 birth years.

---

## 4. Full sequence

Effort assumes one engineer and includes tests. "Blocked by" names what must land first.

| # | Stage | Effort | Blocked by |
|---|---|---|---|
| 1 | **Rules engine + tests** (§2) | 4–6 d | — *(in progress)* |
| 2 | Remaining rules: points races, elimination, club standings, prerequisites | 3–4 d | 1 |
| 3 | Data model + migrations | 3–4 d | §3.1 |
| 4 | Auth, roles, server-side authorization, club isolation, audit log | 5–7 d | §3.2, 3 |
| 5 | Import pipeline (preview → validate → authorised commit) | 5–7 d | 3, 1 |
| 6 | Season, catalogue, events, round dependencies | 3–4 d | 3 |
| 7 | Club roster + race registration with deadlines | 4–5 d | 4, 6 |
| 8 | Start-list generation + score-sheet export against the supplied templates | 5–6 d | 1, 7 |
| 9 | Results entry, review, approval, publication, correction + downstream invalidation | 6–8 d | 4, 8 |
| 10 | Points, rankings, club standings with traceability | 4–5 d | 2, 9 |
| 11 | Dashboards (federation, club, event management) | 6–8 d | 7, 9, 10 |
| 12 | End-to-end tests, regression pass, deployment, backup/restore, handover | 5–7 d | all |

**Total: roughly 10–13 weeks** for one engineer, or **6–8 weeks** with the parallelisation that stages 3–6 allow across two engineers.

Order rationale: the rules engine comes first because it is the only part that can be fully verified against real data **today**, and because every later stage consumes it. Auth precedes registration because club isolation cannot be retrofitted onto an existing registration surface safely. Approval precedes points because only approved results may feed official calculations.

### 4.1 Minimum launch-critical path
If the season timetable forces a reduced first release, the shortest path to a federation that can actually run a round is **stages 1, 3, 4, 5, 6, 7, 8** — import athletes, configure the event, let clubs register, generate start lists and score sheets. Results could then continue to be recorded on the printed score sheets and entered later via stage 9. That is roughly **5–6 weeks** and is the recommendation if the full scope cannot be scheduled.

---

## 5. Working constraints

- **Preserve the existing site.** All 16 routes in `REPOSITORY_AUDIT.md` §3 keep working. Phase 2 is additive, under new route segments. The `/results` file-download page stays; a published-results surface is added beside it, not over it.
- **Pin every new dependency** to an exact version. Over 30 existing deps are pinned to `latest` and must not be widened further.
- **Do not rely on suppressed type errors.** New code typechecks cleanly on its own config.
- **Arabic-first, RTL.** There is no English to preserve (§3.2 of the audit). Mixed Arabic/Latin tokens (`One Lap Road`, `Heat 3`, `Lane`) must render correctly inside RTL.
- **Preserve official terminology.** `مشارك`/`غير مشارك`, `مستوى A`/`مستوى B`, `دور ال 16`, `نصف النهائي`, `Final A`/`Final B`, `دور ال 12` for the Cup. Do not normalise distinct official terms into one generic label.
- **Server-side authorization on every protected read and mutation.** A hidden button is not authorization.
- **Blocked calculations fail loudly**, naming the open question and the incomplete rule reference. Never fall back to a guess.
- **Small reviewable stages.** No unrelated refactoring; the stale `schemas/index.ts` and the duplicate Tailwind/PostCSS configs are logged in the audit as separate cleanups, not folded into Phase 2 work.

### 5.1 Out of scope for Phase 2 MVP
Relay (no rule exists — Q10); disciplines other than speed skating; protest and appeal workflow (Q15); public athlete profiles; parallax and decorative motion on admin screens (the brief explicitly deprioritises these against core competition flows).

---

## 6. Milestone reporting

Each stage reports: what was inspected or implemented; files and migrations changed; tests run with **exact** outcomes; issues or regressions found; open rule questions and the source needing clarification; remaining work prioritised against the deadline; and whether the stage is safe to build on.

A stage is not complete when it compiles. It is complete when its tests pass and, where real source data exists to check it against, when it reproduces that data exactly.
