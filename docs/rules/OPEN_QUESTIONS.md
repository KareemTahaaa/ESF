# Open Sporting-Rule Questions

Raised **2026-10-31** from the supplied source materials. Each entry gives the exact source reference, why it is unresolved, the interim behaviour, and what is blocked until the federation answers.

**Severity:**
- **BLOCKING** — an official output cannot be produced correctly. The system must refuse to generate/publish it.
- **DEFAULTED** — a documented default is applied and surfaced in the UI; safe to proceed, cheap to change.
- **DEFERRED** — out of MVP scope; no implementation attempted.

| ID | Question | Severity |
|---|---|---|
| Q1 | 800/1000m round-of-24 seeding is truncated in the regulations | **BLOCKING** |
| Q2 | `ترتيب 800m-1000m Track Cup` contains `Heat N` strings, not ranks | **BLOCKING** |
| Q3 | No DNS / DNF / DQ / FS rule exists | **BLOCKING** (for affected results) |
| Q4 | Heat remainder handling undefined | DEFAULTED |
| Q5 | Bracket behaviour when fewer than 16 qualify | DEFAULTED |
| Q6 | Whether tied positions consume following positions | **BLOCKING** (when a tie occurs) |
| Q7 | Seeding of athletes with no previous-season result | DEFAULTED |
| Q8 | Two articles both numbered "9" | Documentation only |
| Q9 | Meaning of the `رقم التسجيل` prefix (`2/`, `5/`) | DEFAULTED |
| Q10 | Relay has no procedure at all | DEFERRED |
| Q11 | Long-distance categories: sources disagree | **BLOCKING** (for those races) |
| Q12 | Level B → A promotion order and cutoff | **BLOCKING** (when promotion needed) |
| Q13 | Elimination interval schedule | DEFAULTED (operator input) |
| Q14 | 16 athletes have no birth year | **BLOCKING** (for those athletes) |
| Q15 | Protests, appeals, and result corrections after publication | DEFERRED |
| Q16 | `Event N` numbering of start lists and score sheets | DEFAULTED (format only) |

---

## Q1 — 800/1000m round-of-24 seeding is incomplete in the official document — **ANSWERED 2026-11-03**

> **Federation answer (2026-11-03):** heats of 4; the best times are spread over the heats in a snake — 1st in heat 1, 2nd in heat 2 … then back from the last heat. With 40 athletes in 10 heats, heat 1 holds 1st, 20th, 21st and 40th. Implemented: the round of 24 is seeded by qualification time (`seedByTime`) and snaked over 6 heats of 4 (heat 1 = seeds 1, 12, 13, 24). Tests: `progression.test.ts`, `advancement.test.ts`.

**Source:** `2026-2027.docx`, Article 9 (second), Table 11 row 3 (National League) and Table 12 row 3 (Egypt Cup), nested tables `11>3.1.0`, `11>3.1.1`, `12>3.2.0`, `12>3.2.1`.

The per-heat athlete lists end in a literal ellipsis. Verified: `word/document.xml` contains **24 literal U+2026 characters**; this is the shipped document, not an extraction artifact.

```
Heat 1: ['أول heat 1', '…']       Heat 4: ['أول heat 4', 'أول heat 9', '…']
Heat 2: ['أول heat 2', '…']       Heat 5: ['أول heat 5', 'أول heat 8', '…']
Heat 3: ['أول heat 3', '…']       Heat 6: ['أول heat 6', 'أول heat 7', '…']
```

**Why we cannot infer it.** The visible fragment suggests a mirrored fold (heat 4 takes qualification heats 4 and 9, heat 5 takes 5 and 8, heat 6 takes 6 and 7), implying at least 9 qualification heats. But the number of qualification heats depends on how many athletes enter, so no fixed table can be universally correct. The second table (`الأول / …`, `الرابع / التاسع / …`) appears to be the time-qualifier allocation, equally truncated.

**What IS specified** (and is implemented): R24 *membership* — each qualification heat winner advances, then the field is filled by time to 24; 6 heats of 4; from R24, 6 heat winners + 6 best times → 12; semi-final seeding (3 heats, fully given); semi → 3 heat winners + 1 best time → 4; final of 4.

**Interim behaviour:** compute and display R24 membership, but **refuse to generate the official R24 start list** and block all downstream 800/1000m official output, with the message `قاعدة التوزيع غير مكتملة — مطلوب تأكيد الاتحاد` ("distribution rule incomplete — federation confirmation required"). An unofficial preview may be generated only if explicitly watermarked.

**Needed from the federation:** the complete R24 seeding table, expressed as a rule (not a fixed table) that works for any number of qualification heats.

---

## Q2 — The Cup 800/1000m ranking column is corrupt — **BLOCKING**

**Source:** `Egypt Skate Database.xlsm → Database`, column `ترتيب 800m-1000m Track Cup`.

**138 of 517 non-empty values are strings** `Heat 1` … `Heat 8` instead of numeric ranks (counts: Heat 1 ×20, Heat 2 ×20, Heat 3 ×20, Heat 4 ×18, Heat 5 ×15, Heat 6 ×11, Heat 7 ×9, Heat 8 ×8). The remaining 379 are numeric. The column conflates **final ranking** with **heat allocation**.

By contrast the five other `ترتيب` columns are 100% numeric, and the parallel `ترتيب 800m-1000m Track League` column (380 values) is fully numeric.

**Why it matters:** this is exactly the column a Cup 800/1000m seeding would read. Treating `Heat 5` as a rank, or coercing it to 5, would silently corrupt seeding.

**Interim behaviour:** import the column as raw text with a `needs_review` flag on every non-numeric row; **never** coerce. Exclude these 138 athletes from any automatic Cup 800/1000m seeding and list them for manual federation resolution.

**Needed:** the correct final rankings for those 138 athletes, or confirmation that the Cup 800/1000m has no usable previous-season ranking and should seed by time from `Records` instead.

---

## Q3 — No DNS / DNF / DQ / FS rule exists — **ANSWERED 2026-11-03 for ranking**

> **Federation answer (2026-11-03):** they go to the bottom of the ranking. Implemented for qualification and advancement (no longer blocks). Still to confirm when points are built: whether an athlete at the bottom with a non-`ok` status scores the points of that position or none — `calculatePoints` still flags it.

**Source:** `Egypt Skate Database.xlsm → Records`, `Time` column contains `FS` (false start) ×1 and `DQ` (disqualification) ×1. The elimination-race rules mention `الاستبعاد الفني` (technical disqualification) and the points-race rules say a withdrawn athlete `لا يتم احتساب أي نقاط له` (scores no points).

**What is specified:** only that in **points races** a withdrawn/lapped/disqualified athlete scores no in-race points, and in **elimination races** an athlete who leaves is treated as eliminated in the next elimination lap.

**What is not specified anywhere:**
- Whether a DNS/DNF/DQ athlete occupies a finishing position (and so displaces others down the Article 5 points table) or is removed from the ranking entirely.
- Whether a DQ athlete counts toward the "3 or more athletes" threshold of Article 5.
- Whether a DNS in a qualification round forfeits the level-A place (related to Q12).
- Whether DQ in one round affects later rounds.
- Any distinction between FS, DQ, DNS and DNF for points purposes.

**Interim behaviour:** store the status as a first-class enum (`OK`, `DNS`, `DNF`, `DQ`, `FS`, `UNKNOWN`) and preserve the raw cell value. Athletes with a non-`OK` status receive **no points** and are **excluded from the participant count**, but this is a guess — so any race containing a non-`OK` status is **flagged and blocked from official points publication** until the federation confirms. The brief explicitly forbids inventing these rules.

**Needed:** the full status table and its effect on position, points, participant count, and advancement.

---

## Q4 — Heat remainder handling undefined — DEFAULTED

**Source:** `2026-2027.docx`, Article 9 Table 9 — `يتم تقسيم جميع اللاعبين المسجلين في كل مرحلة إلى heats من 4 لاعبين` ("divide all registered athletes into heats of 4"), with no statement about what happens when the count is not a multiple of 4.

**Default applied** — the legacy `BuildHeatSizes` behaviour from `Module2`, chosen because it is the federation's own existing practice: `numHeats = ceil(total / perHeat)`, then distribute athletes evenly, giving `base + 1` to the first `remainder` heats. So 10 athletes at 4/heat → **4, 3, 3** (not 4, 4, 2). The legacy comment states the intent: *"keeps heats similar size; avoids tiny last heat."*

**Needed:** confirmation that balanced heats are correct, and whether the larger heats should be the fastest-seeded ones (current default) or the slowest.

---

## Q5 — Bracket behaviour when fewer than 16 athletes qualify — DEFAULTED

**Source:** the regulations assume a full field (16 for 100m/One Lap/500m, 12 for 200m, 24 for 800/1000m) and never address short fields. Small categories certainly occur: in the 2025-26 start list, `10K Points Road` had 13 athletes total and the `عمومي - بنات` block had 2.

**Default applied** — the legacy `ComputeClassABracket` thresholds, again because they are existing federation practice. For 100m: `n ≥ 9` → start at Round of 16; `n ≥ 5` → start at Quarter-Final; `n ≥ 3` → start at Semi-Final; `n = 2` → straight to Final A; `n = 1` → Final A.

**Needed:** confirmation of the thresholds, the equivalents for One Lap / 500m / 800-1000m, and whether a short field still produces both Final A and Final B.

---

## Q6 — Do tied positions consume the following positions? — **ANSWERED 2026-11-03**

> **Federation answer (2026-11-03):** tied athletes share the rank, and the following rank is skipped (1, 2, 2, 4). Implemented: no longer blocks; a tie on the last qualifying place takes every tied athlete through (`takeWithTies`); points keep `tieConsumesPositions: true`.

**Source:** `2026-2027.docx`, Article 5 — `إذا احتل اثنان أو أكثر من اللاعبين نفس المركز في التصنيف النهائي، يتم منح النقاط بالتساوي`.

The rule is clear that tied athletes are awarded points **equally** (each receives that position's full points — "equally", not divided). What is **not** stated is what the next athlete receives: if two tie for 1st, is the next athlete 2nd (receiving 90) or 3rd (receiving 80)? Standard sporting practice is the latter, but the document does not say so, and the brief forbids assuming an unstated tie-breaker.

**Interim behaviour:** award tied athletes the full points for the shared position, and **flag any race containing a tie**, blocking official points publication until the federation confirms the following-position treatment. Make the choice a ruleset setting (`tie_consumes_positions: true | false`) so confirmation is a config change, not a code change.

**Needed:** the treatment of the position(s) after a tie, and whether a tie is even possible in timed races given timing precision (the data shows times to 0.01 s).

---

## Q7 — Seeding athletes with no previous-season result — DEFAULTED

**Source:** the brief states unranked athletes are "placed last". The **regulations do not mention this case at all** — Table 9 says only that heats are seeded `بناء على نتائج اللاعبين لنفس المسافة في الدوري العام الموسم الماضي`.

Note the regulations seed on the previous season's **National League result at the same distance**, not on an overall ranking as the brief describes. The `Records` sheet matches the regulations (per-distance times, NL events only, **no Cup results**). The regulations govern; the discrepancy is recorded in `RULE_MATRIX.md` §6.

This case is common in practice: ranking coverage in the `Database` sheet is only 513–518 of 777 athletes per race (380 for the League 800/1000m), so roughly a third of athletes are unranked — plus every newly registered athlete.

**Default applied:** unranked athletes are seeded **after all ranked athletes**; among themselves they are ordered by **federation number ascending** — a stable, reproducible tiebreak. Explicitly **not** random, unlike the legacy `ShuffleArray`.

**Needed:** confirmation, and the intended order among unranked athletes (federation number? registration date? draw?). If a draw is intended, it must be a seeded, recorded draw so start lists are reproducible.

---

## Q8 — Two articles are both numbered "9" — documentation only

**Source:** `2026-2027.docx` contains `المادة 9: ترتيب اللاعبين في جولة التصفيات` (qualification-round heat division) **and** `المادة 9: ترتيب و تأهل اللاعبين في الدوري العام و الكأس` (League/Cup progression). There is no Article 10.

No functional impact, but rule citations are ambiguous. This matrix disambiguates them as "Article 9 (first)" and "Article 9 (second)".

**Needed:** corrected numbering in the next revision, so that audit records citing a rule version are unambiguous.

---

## Q9 — Meaning of the `رقم التسجيل` prefix — DEFAULTED

**Source:** `Egypt Skate Database.xlsm → Database`, `رقم التسجيل` formatted `{prefix}/{number}`: prefix `2` for 773 athletes, prefix `5` for 4 athletes.

Most likely a discipline or federation-section code (`2` = speed skating), which would matter for the multi-discipline architecture. Unconfirmed.

**Default applied:** store `رقم التسجيل` verbatim as an opaque secondary identifier. Use `الرقم` (federation number — verified unique across all 777 rows) as the stable join key. No semantics are attached to the prefix.

**Needed:** what the prefix denotes, and whether the 4 athletes with prefix `5` are a different discipline, a different registration class, or a data-entry error.

---

## Q10 — Relay has no procedure — DEFERRED

**Source:** `3,000 Relay` / `3,000m relay` appears as a distance for عمومي/شباب/ناشئين in Article 7 Tables 6–7. Article 5 says `في سباق التتابع يتم منح الفريق النقاط حسب الترتيب النهائي للفريق`.

That single sentence is the **only** relay rule in the materials. Absent: team size, how many teams a club may enter, athlete eligibility and category mixing, substitutions, exchange rules, heat/lane allocation, qualification, and — critically — **how team points flow to individual athlete totals and to club standings**.

Note the 24-race catalogue contains **no relay race**, so relay is not scheduled for 2026-27 as catalogued.

**Interim behaviour:** not implemented. The data model reserves the concept (a result may belong to a team rather than an athlete) so adding it later is not a migration, but no relay workflow, scoring, or UI exists in the MVP.

**Needed:** the full relay regulation, if relay is to run this season.

---

## Q11 — Long-distance categories: the two sources disagree — **ANSWERED 2026-11-03**

> **Federation answer (2026-11-03):** seniors (عمومي), juniors (شباب) and youth (ناشئين) are the only categories in the long races, and juniors and youth race merged. Implemented: the flag and the event-screen option are removed.

**Source conflict:**
- `2026-2027.docx` Article 7 Tables 6–7 list `10,000m points`, `15,000m elimination`, `5,000 points`, `10,000m elimination` for **عمومي, شباب, and ناشئين**.
- `Races 2026-2027.docx` rows 15–18 annotate all four long-distance races `مراحل شباب و عمومي` — **Junior and Senior only**, omitting ناشئين.
- Article 9 prose for these races says `مع ضم المراحل السنية للناشئين والشباب` ("merging the Youth and Junior categories"), which **presupposes ناشئين participate**.

Two sources against one, and the merge rule is meaningless without ناشئين — but the catalogue is the operational document for this season and may reflect a deliberate change.

The 2025-26 data supports ناشئين participating: the `10K Points Road` start list contains 7 ناشئين athletes.

**Interim behaviour:** eligibility for these four races is a **ruleset setting**, defaulting to the regulations (ناشئين included, merged with شباب). The conflict is surfaced to the admin on the race-configuration screen, and official points for these races are **blocked** until the federation confirms which source governs.

**Needed:** whether ناشئين skate the long distances in 2026-27, and if so whether they are merged with شباب for ranking and points (which changes the Article 5 points table applied — Junior 80/72/64… vs Youth 60/54/48…). The merged block in the 2025-26 score sheet was labelled `شباب`, suggesting the Junior table, but this is not stated.

---

## Q12 — Level B → A promotion order and cutoff — **ANSWERED 2026-11-03**

> **Federation answer (2026-11-03):** only when one or more athletes ranked A in the Qualifications do not register for the following round are B athletes promoted — sorted by time — to fill the round to its size (16 for 100m, One Lap and 500m; 24 for 800/1000m; 12 for 200m). Implemented in migration 0009 and `advancement.ts`: clubs register qualified athletes for the first League/Cup round; level A = registered A athletes plus the fastest registered B athletes needed to fill it; level B = the remaining registered B athletes.

**Source:** `2026-2027.docx`, Article 9 (second), repeated for every distance — `في حالة عدم تسجيل المشاركة لأحد اللاعبين من مستوى (A) في دور ال 16 يتم تصعيد اللاعبين من مستوى (B) حتى يكتمل العدد في A الى 16 لاعب`.

Specified: if a level-A athlete does not register, level-B athletes are promoted until A is full. Not specified:
- **Order** of promotion — presumably the next-best qualification rank, but unstated.
- **Cutoff** — how late promotion may occur (at registration close? after the start list is published? on race day for a no-show?).
- Whether a promoted athlete **also** keeps their level-B place, or is removed from B.
- Whether their level-B result is voided if already skated.
- Whether a promoted athlete is re-seeded into the A bracket at the vacated seed position or appended last.

The last point materially changes the bracket: filling seed 3 differs from appending at seed 16.

**Interim behaviour:** promotion is **never automatic**. The system identifies candidates in qualification-rank order, presents them to a federation admin, and requires explicit confirmation per promotion, recorded in the audit trail with the acting user, timestamp, and the vacated seed. Start-list generation is blocked while an unfilled level-A place exists, with the shortfall named.

**Needed:** promotion order, deadline, seed placement, and the effect on the athlete's level-B entry and result.

---

## Q13 — Elimination interval schedule — DEFAULTED (operator input)

**Source:** `2026-2027.docx`, Article 9 (second), Table 10 row 4 and Table 11 row 5 — the elimination interval (every 2 or 3 laps) and the number eliminated per lap (one or two) are determined `طبقاَ لعدد المشاركين بالسباق` ("according to the number of participants"), such that exactly 3 athletes remain in the final lap.

This is an explicit delegation to the organiser, not an omission — no formula exists to be discovered. Fixed points: elimination begins at lap 45 of 50 (10,000m Track) or after the first 1,000m (15,000m Road); in the last 3, 2 and 1 laps exactly one athlete is eliminated; exactly 3 remain at the final lap.

**Default applied:** treat the schedule as **operator input**. An official enters the interval and per-lap elimination counts before the race; the system validates that the schedule starts at the correct lap, eliminates one per lap in the final three laps, and terminates with exactly 3 athletes — rejecting it otherwise. The schedule is stored with the result so the final ranking is explainable and reproducible.

**Needed:** nothing blocking. Optionally, a federation-preferred default schedule per entrant-count band, which would be entered as ruleset configuration rather than code.

---

## Q14 — 16 athletes have no birth year — **RESOLVED 2026-11-03: not imported**

> **Federation instruction (2026-11-03):** players without complete information, or with wrong information, are not imported. The 16 athletes without a birth year are rejected at import; an unreadable ranking value (Q2) is left out and the athlete imported without it.

**Source:** `Egypt Skate Database.xlsm → Database` — 16 of 777 rows have **neither** `YOB` **nor** `المرحلة 2026-2027`. All are 2025-26 `ناشئين` or `تحت 8`:

| `الرقم` | Name | 2025-26 category |
|---|---|---|
| 2599 | مريم محمد عبدالمجيد ابراهيم | ناشئين |
| 2604 | جودي محمد سلامة محمد | ناشئين |
| 2628 | سلمى محمد ممدوح | ناشئين |
| 2602 | محمد عمرو محمد قناوي | ناشئين |
| 2612 | معاذ عبدالله محمود محمد | ناشئين |
| 2586 | ليلى معاذ محمد علي | تحت 8 |
| 2610 | ليله محمد احمد | تحت 8 |
| 2607 | أمينة محمد علي محمود | تحت 8 |
| 2260 | زينة يسري علي | تحت 8 |
| 2613 | كارما وليد محمد عبدالعزيز | تحت 8 |
| 2615 | ليلي احمد يحي | تحت 8 |
| 2650 | فيروز يحيى عبدالمنعم | تحت 8 |
| 2587 | محمد أحمد محمد السيد | تحت 8 |
| 2583 | اسامة محمد اسامة مصطفى | تحت 8 |
| 2065 | نور أحمد زيدان آدم | تحت 8 |
| 2616 | معاذ وليد فتح الله كيلاني | تحت 8 |

Age category is a pure function of birth year, so these athletes **cannot be assigned a 2026-27 category** and therefore cannot be shown as eligible for any race. Their 2025-26 category only bounds the answer (a 2025-26 `ناشئين` was born 2010–2011, which in 2026-27 splits across شباب and ناشئين) — it does not determine it.

**Interim behaviour:** import all 16 with `category_status = unresolved`; exclude them from club entry screens with the explicit reason `سنة الميلاد غير مسجلة` ("birth year not recorded"); surface them on the federation dashboard as a blocking migration issue. **Never infer** a birth year from the previous category.

**Needed:** the birth year for each of the 16 athletes.

---

## Q15 — Protests, appeals, and post-publication corrections — DEFERRED

**Source:** the regulations contain **no** protest, appeal, jury, or result-correction procedure. Article 1 reserves the federation's right to amend the regulations with notice to clubs, but says nothing about contesting a result.

The brief requires a correction workflow (permission, reason, old/new value preserved, downstream invalidation, re-approval). That is implemented as a **technical** capability with a full audit trail. What is **not** defined is the **sporting** procedure: who may protest, within what window, who adjudicates, and whether a corrected result can change an already-awarded medal or published club standing.

**Interim behaviour:** corrections are technically supported, restricted to authorised federation staff, require a written reason, preserve both values, and mark all downstream start lists, qualifications, points, and standings for recalculation and re-approval. No automatic sporting consequence is inferred, and no time window is enforced.

**Needed:** the protest and appeal procedure, including any deadline after which a published result is final.

---

## Q16 — `Event N` numbering — DEFAULTED (format only)

**Source:** `Start List - … 2025-2026.xlsx`, `Score Sheets - … 2025-2026.xlsx`. Level A blocks run `Event 1`… and level B starts at `Event 21`; one event per category × gender, girls first. The rule that produced the numbers is not written anywhere.

**Interim behaviour:** `lib/competition/start-list.ts` `eventNumber()` numbers blocks by position in the 2026-27 category order × (بنات, بنين): `عمومي بنات` = 1 … `تحت 8 بنين` = 20. This is a document label, not a sporting rule: it changes no heat, lane or seed.

**Needs:** confirmation that this numbering is what officials expect, and how level B and finals should continue it.

---

## Resolution process

1. Federation reviews this document and answers in writing.
2. Each answer is recorded in `RULE_MATRIX.md` against its rule row, with the date and the person who confirmed it.
3. The corresponding ruleset version is updated; the setting flips from blocked to active.
4. Tests for the newly confirmed rule are added **before** the blocking state is lifted.
5. Past seasons' published results are never recalculated under a new ruleset version.

Until an answer is recorded, every **BLOCKING** item must keep its affected official output disabled. A blocked calculation must state **which** question blocks it and **which** rule reference is incomplete — never fail silently or fall back to a guess.
