# Rule Matrix — Speed Skating, Season 2026–2027

Transcribed **2026-10-31** from `2026-2027.docx` (regulations) and `Races 2026-2027.docx` (catalogue), both in `materials source/`.

**How to read this file.** Every row is labelled:
- **FACT** — stated explicitly in a source document. Quoted or tabulated verbatim.
- **ASSUMPTION** — not stated; a documented default chosen to make progress. Configurable, and flagged in the UI.
- **OPEN** — unresolved. Implementation must **block official calculation/publication** for the affected case until the federation confirms. See `OPEN_QUESTIONS.md`.

Arabic ordinals used in the seeding tables: `الأول`=1, `الثاني`=2, `الثالث`=3, `الرابع`=4, `الخامس`=5, `السادس`=6, `السابع`=7, `الثامن`=8, `التاسع`=9, `العاشر`=10, `الحادي عشر`=11, `الثاني عشر`=12, `الثالث عشر`=13, `الرابع عشر`=14, `الخامس عشر`=15, `السادس عشر`=16.

---

## 1. Age categories — Article 3 (المادة 3)

**FACT.** Source: `2026-2027.docx`, Article 3, Table 1 (11×4), verbatim.

| Category (ar) | Category (en) | Gender | Birth years |
|---|---|---|---|
| عمومي | Senior | F / M | 2008 **and earlier** |
| شباب | Junior | F / M | 2009–2010 |
| ناشئين | Youth | F / M | 2011–2012 |
| تحت 14 | Cadet 14 | F / M | 2013 |
| تحت 13 | Cadet 13 | F / M | 2014 |
| تحت 12 | Cadet 12 | F / M | 2015 |
| تحت 11 | Pre-cadet 11 | F / M | 2016 |
| تحت 10 | Pre-cadet 10 | F / M | 2017 |
| تحت 9 | Pre-cadet 9 | F / M | 2018 |
| تحت 8 | Mini 8 | F / M | 2019 **and later** |

- **Implementation:** `lib/competition/rules/age-category.ts`, keyed by season ruleset — **not** hardcoded globally.
- **Why season-scoped:** the 2025-26 data uses entirely different boundaries (`شباب (2008-2009)`, `ناشئين (2010-2011)`, and legacy names `صاعدين 14`, `أشبال 11`). Boundaries shift every season; published past results must not change when a new season's table is added.
- **Cross-validation:** applying this table to the 761 athletes in `Egypt Skate Database.xlsm → Database` that have a `YOB` reproduces the sheet's own `المرحلة 2026-2027` column with **0 mismatches**.
- **Tests:** every boundary year (2008/2009, 2010/2011, 2012/2013, 2013/2014, 2014/2015, 2015/2016, 2016/2017, 2017/2018, 2018/2019); open-ended ends (1990→Senior, 2025→Mini 8); null/absent `YOB` → no category assigned and the athlete is **not** entry-eligible.

---

## 2. Competitions — Article 4

**FACT.** Table 2. Three official championships, each open to **تحت 8 → عمومي** (all ten categories):

| Championship (ar) | (en) | Catalogue races |
|---|---|---|
| جولة التصفيات (التصنيفية) | Qualifications | 1–5 |
| بطولة الدوري العام | National League | 6–18 |
| بطولة كأس مصر | Egyptian Cup | 19–24 |

**FACT** (Article 9, first): the Qualification round is held **before** the League and the Cup, and determines who qualifies for both.

---

## 3. Points — Article 5

**FACT.** Table 3, verbatim. Positions **1–8 only**; no points for 9th or lower.

| Category | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th |
|---|---|---|---|---|---|---|---|---|
| عمومي (Senior) | 100 | 90 | 80 | 75 | 70 | 65 | 60 | 55 |
| شباب (Junior) | 80 | 72 | 64 | 60 | 56 | 52 | 48 | 44 |
| ناشئين (Youth) | 60 | 54 | 48 | 44 | 41 | 38 | 35 | 32 |
| تحت 14 | 50 | 45 | 42 | 38 | 36 | 32 | 30 | 27 |
| تحت 13 | 50 | 45 | 42 | 38 | 36 | 32 | 30 | 27 |
| تحت 12 | 50 | 45 | 42 | 38 | 36 | 32 | 30 | 27 |
| تحت 11 | 40 | 36 | 32 | 28 | 26 | 24 | 22 | 20 |
| تحت 10 | 40 | 36 | 32 | 28 | 26 | 24 | 22 | 20 |
| تحت 9 | 40 | 36 | 32 | 28 | 26 | 24 | 22 | 20 |
| تحت 8 | 40 | 36 | 32 | 28 | 26 | 24 | 22 | 20 |

Three accompanying prose rules, all **FACT**:

1. **Minimum participants.** `يبدأ احتساب النقاط للاعبين في أي مرحلة عندما يكون هناك 3 لاعبين أو أكثر في المرحلة` — points are awarded in a category only when it has **3 or more athletes**. Below that, **no points at all** for that category.
2. **Ties.** `إذا احتل اثنان أو أكثر من اللاعبين نفس المركز في التصنيف النهائي، يتم منح النقاط بالتساوي` — athletes sharing a final position each receive **the full points for that position** (equally, not split, not averaged). The text says "equally" (بالتساوي) and does not mention division.
3. **Relay.** `في سباق التتابع يتم منح الفريق النقاط حسب الترتيب النهائي للفريق` — the **team** receives points by the team's final position.

- **Implementation:** `lib/competition/rules/points.ts`.
- **OPEN:** whether a shared position consumes the following position(s) — i.e. two athletes tied 1st, does the next get 2nd or 3rd? Not stated (Q6). Also **OPEN**: how relay team points distribute to individual athletes and club standings (Q10).
- **Tests:** each category × positions 1–8; position 9+ → 0; 2-athlete category → 0 points for everyone; exactly 3 → points awarded; tie at 1st → both receive 100 (Senior); unknown category → error, never a silent 0.

---

## 4. Race distances per championship — Article 7

**FACT.** Tables 5–8.

### Qualifications (Table 5)
| Categories | Road | Track |
|---|---|---|
| عمومي … تحت 12 | 100m, One Lap | 200m, 500m, **1000m** |
| تحت 11 … تحت 8 | 100m, One Lap | 200m, 500m, **800m** |

### National League (Tables 6–7)
| Categories | Road | Track |
|---|---|---|
| عمومي, شباب, ناشئين | 100m, One Lap, 10,000m points, 15,000m elimination, 3,000 relay | 200m TT, 500m sprint, 1,000m sprint, 5,000 points, 10,000m elimination, 3,000m relay |
| تحت 14 … تحت 12 | 100m, One Lap | 200m TT, 500m sprint, 1,000m sprint |
| تحت 11 … تحت 8 | 100m, One Lap | 200m TT, 500m sprint, **800m** sprint |

### Egypt Cup (Table 8)
| Categories | Road | Track |
|---|---|---|
| عمومي … تحت 12 | 100m, One Lap | 1000m |
| تحت 11 … تحت 8 | 100m, One Lap | 800m |

**Two consequences that must be encoded, not assumed:**
- The **800m/1000m split is by category**, not by race: `تحت 11` and below skate 800m, `تحت 12` and above skate 1000m. The legacy data models this as the single race `800m-1000m`.
- **Long distances (points, elimination, relay) exist only for عمومي, شباب, ناشئين.** Offering them to a Cadet is an eligibility error.

- **Implementation:** `lib/competition/rules/eligibility.ts`.
- **Tests:** a `تحت 14` athlete is ineligible for 10,000m points; a `تحت 11` athlete gets 800m not 1000m; a `تحت 12` athlete gets 1000m; Cup offers no 200m/500m; eligibility is evaluated **per distance**, never inherited from another distance.

---

## 5. Club standings — Article 8

**FACT.** `يتم ترتيب الأندية بناءً على مجموع النقاط التي حققها اللاعبون من كل نادي في البطولة ويكون ترتيب الأندية في كل بطولة على حدا` — club rank = sum of its athletes' points **within that championship**, computed **separately per championship**. Winner = most points.

**FACT.** Club standings are calculated for **the National League and the Egypt Cup only** — the Qualification round is explicitly excluded from the Article 8 list.

- **Implementation:** `lib/competition/rules/club-standings.ts`.
- **Must not:** pool the two championships into one table, or include qualification-round points.
- **Historical affiliation:** points count for the club the athlete represented **at the time of the result**, so club membership must be versioned (see `../phase-2/DATA_MIGRATION_MAP.md` §3).
- **Tests:** points summed per championship separately; qualification results excluded; an athlete who changes clubs mid-season leaves earlier points with the former club; club with no scoring athletes appears with 0 rather than vanishing.

---

## 6. Qualification round — heat division (Article 9, first)

**FACT.** Table 9 (6×3), verbatim.

| Type | Distance | Athletes per heat | Seeding basis |
|---|---|---|---|
| Road | 100m | **2** | previous season's National League result at the same distance |
| Road | One Lap | **4** | same |
| Track | 200m | **1** | — (individual time trial) |
| Track | 500m | **4** | same |
| Track | 1,000m / 800m | **4** | same, **plus**: distribute the heat winners across heats first, then fill the rest by time |

The repeated Arabic phrase is `بناء على نتائج اللاعبين لنفس المسافة في الدوري العام الموسم الماضي`.

> **Important divergence from the brief.** The brief says opening qualification is seeded from "the previous season's **ranking**". The regulations say it is seeded from the previous season's **National League results at the same distance** — a per-distance time, not a single overall rank. The regulations govern. The legacy `Records` sheet supports this: it holds per-distance times for `نهائيات الدوري العام` and `تصفيات الدوري العام`, and holds **no Egypt Cup results at all**.

**ASSUMPTION** (Q7): athletes with no previous-season National League result at that distance are seeded **last**, after all ranked athletes. The brief states this; the regulations do not. Among unranked athletes the order is **undefined** — implementation must use a stable, documented tiebreak (federation number ascending) and never a random shuffle.

- **Implementation:** `lib/competition/rules/seeding.ts`, `heats.ts`.
- **Rejected legacy behaviour:** `Module2.GenerateStartLists` shuffles athletes randomly into heats (`ShuffleArray`, `Randomize`). That contradicts this table and **must not be ported**. See `../phase-2/SOURCE_MATERIALS_INVENTORY.md` §4.3.
- **ASSUMPTION** (Q4): when the entry count is not a multiple of the heat size, use the legacy `BuildHeatSizes` distribution — `numHeats = ceil(total / perHeat)`, then spread athletes evenly (`base + 1` for the first `remainder` heats) so there is no tiny final heat. 10 athletes at 4/heat → **4, 3, 3**. The regulations are silent on remainders.
- **Tests:** exact multiples (16 @ 4 → 4×4); remainders (10 @ 4 → 4/3/3; 7 @ 2 → 2/2/2/1 vs balanced 2/2/2/1; 1 @ 4 → single heat of 1); 200m always 1 per heat; ranked-before-unranked ordering; unranked order is deterministic across runs.

---

## 7. Race catalogue — `Races 2026-2027.docx`

**FACT.** All 24 rows, verbatim. `#` = catalogue number, used as the stable import key.

| # | Championship | Venue | Type | Race | Qualification / progression rule |
|---|---|---|---|---|---|
| 1 | Qualifications | مدرسة بن مسعود | Track | تصفيات 200m | best **12** times advance |
| 2 | Qualifications | مدرسة بن مسعود | Track | تصفيات 500m | best **16** times advance |
| 3 | Qualifications | مدرسة بن مسعود | Track | تصفيات 800/1000m | heat winners + best times → **24** qualifiers |
| 4 | Qualifications | ايروسبورت | Road | تصفيات 100m | best **16** times advance |
| 5 | Qualifications | ايروسبورت | Road | تصفيات One Lap | best **16** times advance |
| 6 | National League | مدرسة بن مسعود | Track | 500m R16 + level B | R16: 1st **and 2nd** of each heat → **8** qualifiers; level B |
| 7 | National League | مدرسة بن مسعود | Track | 800/1000m R24 + semi + level B | R24: 1st + best times → **12**; semi: 1st + best times → **4**; level B |
| 8 | National League | ايروسبورت | Road | 100m R16 + level B | R16: **1st only** of each heat → **8**; level B |
| 9 | National League | ايروسبورت | Road | One Lap R16 + level B | R16: 1st **and 2nd** of each heat → **8**; level B |
| 10 | National League | مدرسة بن مسعود | Track | 200m final + level B | 200m: final; level B |
| 11 | National League | مدرسة بن مسعود | Track | 500m final | semi-final → final |
| 12 | National League | مدرسة بن مسعود | Track | 800/1000m final | final |
| 13 | National League | ايروسبورت | Road | 100m final | R8 → semi-final → final |
| 14 | National League | ايروسبورت | Road | One Lap final | semi-final → final |
| 15 | National League | مدرسة بن مسعود | Track | long distance | **5K Track Points** — شباب + عمومي only |
| 16 | National League | مدرسة بن مسعود | Track | long distance | **10K Track Elimination** — شباب + عمومي only |
| 17 | National League | ايروسبورت | Road | long distance | **10K Road Points** — شباب + عمومي only |
| 18 | National League | ايروسبورت | Road | long distance | **15K Road Elimination** — شباب + عمومي only |
| 19 | Egypt Cup | مدرسة بن مسعود | Track | 800/1000m R24 + R12 + level B | R24: 1st + best times → **12**; **R12**: 1st + best times → **4**; level B |
| 20 | Egypt Cup | ايروسبورت | Road | 100m R16 + level B | R16: **1st only** → **8**; level B |
| 21 | Egypt Cup | ايروسبورت | Road | One Lap R16 + level B | R16: 1st and 2nd → **8**; level B |
| 22 | Egypt Cup | مدرسة بن مسعود | Track | 800/1000m final | final |
| 23 | Egypt Cup | ايروسبورت | Road | 100m final | R8 → semi-final → final |
| 24 | Egypt Cup | ايروسبورت | Road | One Lap final | semi-final → final |

**Two conflicts with the regulations that the implementation must not paper over:**

1. **Catalogue rows 15–18 say the long distances are for `مراحل شباب و عمومي` (Junior + Senior).** Article 7 Tables 6–7 include **ناشئين (Youth)** as well. The sources disagree. **OPEN — Q11.** Until resolved, long-distance eligibility must be configurable, defaulting to the **regulations** (the higher authority), with the discrepancy surfaced to the admin.
2. **The Egypt Cup 800/1000m uses a round of 12** (row 19), whereas the National League uses a **semi-final** (row 7), despite the regulations' Table 12 describing the Cup identically to the League. The catalogue is more specific and is per-event configuration, so it governs — but the round must be labelled `دور ال 12` for the Cup and `نصف النهائي` for the League, not normalised into one generic "semi".

Rows 10–14 and 22–24 are titled `نهائي الدوري العام …` ("National League final") **even under Egypt Cup** (rows 22–24) — a copy-paste artifact in the source. The championship column is authoritative; the title is not.

- **Implementation:** parse this table into a `race_catalogue` table keyed by `#`. **Do not retype it** — the `.docx` is machine-readable (`docs/scripts/` extraction, see `../phase-2/DATA_MIGRATION_MAP.md` §6).

---

## 8. National League and Cup — progression (Article 9, second)

All of §8 is **FACT** transcribed from Tables 10–12 and their 18 nested tables, except where marked.

### 8.1 Classification levels A and B — the general pattern

Stated for 100m, One Lap, 200m, 500m, and 800/1000m alike:

- **Level A (`مستوى التصنيف الأول`)** — the top *N* athletes per category from the Qualification round at that distance enter the main bracket (*N* = 16, except 200m where *N* = 12 and 800/1000m where *N* = 24).
- **Level B (`مستوى التصنيف الثاني`)** — every athlete **not** qualified into level A competes in a parallel B competition, divided into heats **by their qualification-round ranking** (heat size per §8.2).
- **Promotion:** `في حالة عدم تسجيل المشاركة لأحد اللاعبين من مستوى (A) … يتم تصعيد اللاعبين من مستوى (B) حتى يكتمل العدد في A` — if a level-A athlete does not register, level-B athletes are promoted in order until A is full again.

**OPEN — Q12:** promotion order is not stated (presumably next-best qualification rank), nor the deadline after which promotion is frozen, nor whether a promoted athlete still scores in B. Implementation must require explicit admin confirmation for each promotion and record it in the audit trail.

### 8.2 Level B heat sizes
| Distance | Level B heat size |
|---|---|
| 100m | 2 |
| One Lap | 4 |
| 200m | 1 |
| 500m | 4 |
| 800/1000m | 4 |

### 8.3 100m Road — National League (Table 10 r1) and Egypt Cup (Table 12 r1), identical

**Round of 16** — 8 heats of 2, seeded from qualification rank (nested table 10>1.1.0):

| Heat | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Seeds | 1, 16 | 2, 15 | 3, 14 | 4, 13 | 5, 12 | 6, 11 | 7, 10 | 8, 9 |

Formula: heat *i* receives seeds *i* and *17 − i*. **1st of each heat only** advances → 8.

**Round of 8** — 4 heats of 2 (nested 10>1.1.1):

| Heat | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| From | winner H1, winner H8 | winner H2, winner H7 | winner H3, winner H6 | winner H4, winner H5 |

**1st of each heat** advances → 4.

**Semi-final** — 2 heats of 2 (nested 10>1.1.2):

| Heat | 1 | 2 |
|---|---|---|
| From | winner QF1, winner QF4 | winner QF2, winner QF3 |

**Final** — split: `1st of each semi → Final A` (places 1–2); `2nd of each semi → Final B` (places 3–4).

Catalogue rows 13 and 23 confirm the sequence `دور ال8 – نصف النهائي – النهائي`.

### 8.4 One Lap Road — National League (Table 10 r2) and Egypt Cup (Table 12 r2), identical

**Round of 16** — 4 heats of 4 (nested 10>2.1.0):

| Heat | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Seeds | 1, 8, 9, 16 | 2, 7, 10, 15 | 3, 6, 11, 14 | 4, 5, 12, 13 |

Serpentine across 4 heats. **1st and 2nd of each heat** advance → 8.

**Semi-final** — 2 heats of 4 (nested 10>2.1.1):

| Heat | 1 | 2 |
|---|---|---|
| From | 1st H1, 1st H4, 2nd H1, 2nd H4 | 1st H2, 1st H3, 2nd H2, 2nd H3 |

**1st and 2nd of each heat** advance → 4.

**Final** — single final of 4, placed 1st → 4th.

### 8.5 200m Track — National League (Table 11 r1)

Pure time trial. **Top 12** from qualification enter level A. `يتم تقسيم اللاعبين الى heats مكونة من لاعب واحد و يتم الترتيب النهائي بالزمن` — heats of **one** athlete, final ranking **by time**. Level B identical with heats of 1. No bracket, no advancement rounds. Catalogue row 10 confirms: `200m: دور النهائي` + level B.

### 8.6 500m Track — National League (Table 11 r2)

Structurally **identical to One Lap** (§8.4): top 16 → 4 heats of 4 with the same serpentine seeds (nested 11>2.1.0 is byte-identical to 10>2.1.0) → 1st and 2nd advance → 2 semi heats of 4 (same pattern) → 1st and 2nd advance → final of 4, places 1–4.

> Catalogue row 6 says the 500m R16 qualifies `المركز الأول والثاني لكل heat – (8 متأهلين)` — 2 per heat from 4 heats = 8. Consistent.

### 8.7 800m / 1000m Track — **PARTIALLY OPEN**

Prose (Table 11 r3, Table 12 r3), **FACT**:
- **Round of 24:** the 1st of each qualification heat advances, then the remaining places are filled **by time** until 24 athletes are reached. Split into **6 heats** of 4.
- From the R24: **1st of each heat** advances to the semi-final; the rest are **ranked by time**, and the best 6 by time also advance — `يتأهل بجانب أوائل الheats باقي اللاعبين بترتيب الزمن من الأول الى السادس` → 6 + 6 = **12**. Catalogue row 7 confirms **12**.
- **Semi-final:** **3 heats** of 4. `يتأهل الأول لكل heat الى دور النهائي` (3) `ويتأهل الأول بالزمن` (best remaining time, 1) → **4**. Catalogue row 7 confirms **4**.
- **Final:** 4 athletes, places 1–4.
- Qualification-round note (Table 9): distribute the **heat winners** across heats first, then fill the rest by time.

Semi-final seeding is **FACT** (nested 11>3.1.2 / 12>3.2.2) — 3 heats, though the source header row omits "Heat 3":

| Heat | 1 | 2 | 3 |
|---|---|---|---|
| From | 1st H1, 1st H6, time-qualifier 1, time-qualifier 6 | 1st H2, 1st H5, time-qualifier 2, time-qualifier 5 | 1st H3, 1st H4, time-qualifier 3, time-qualifier 4 |

**The round-of-24 seeding is OPEN — Q1, blocking.** The two source tables (nested 11>3.1.0, 11>3.1.1 and their Cup twins) are **truncated with a literal `…`** in the official file:

```
Heat 1: ['أول heat 1', '…']            Heat 4: ['أول heat 4', 'أول heat 9', '…']
Heat 2: ['أول heat 2', '…']            Heat 5: ['أول heat 5', 'أول heat 8', '…']
Heat 3: ['أول heat 3', '…']            Heat 6: ['أول heat 6', 'أول heat 7', '…']
```

Verified as 24 literal U+2026 characters in `word/document.xml` — the document ships incomplete. The visible fragment implies a mirrored fold (heat 4 ← qualification heats 4 and 9, heat 5 ← 5 and 8, heat 6 ← 6 and 7), which would require ≥9 qualification heats; but the qualification heat count varies with the entry count, so no fixed table can be correct and **the pattern cannot be reconstructed from the document.**

**Required behaviour:** implement R24 heat *membership* (which is fully specified) but **block generation of the official R24 start list** with an explicit "rule incomplete — federation confirmation required" state. Do not guess the within-heat seeding.

Additionally, the Egypt Cup replaces the semi-final with a **round of 12** (catalogue row 19) with the same 1st + best-times → 4 progression. Its seeding table is subject to the same `…` truncation.

### 8.8 Points races — 5,000m Track and 10,000m Road

**FACT**, Table 10 r3 and Table 11 r4:
- **No qualification** — all registered athletes in the category take part, with **ناشئين and شباب merged** (`مع ضم المراحل السنية للناشئين والشباب`).
- **5,000m Track:** 25 laps; scoring starts at **lap 21** and continues every lap.
- **10,000m Road:** scoring starts **after the first 1,000m**, every lap.
- **Scoring lap:** 1st = **2** points, 2nd = **1** point.
- **Final lap:** 1st = **3**, 2nd = **2**, 3rd = **1**.
- An athlete who leaves the race — technical disqualification, being lapped by the leader (`اللحاق به من الأول`), or any other reason — **scores nothing**.
- Final ranking = **total in-race points**; ties between two athletes are broken by **position in the final lap**.
- Championship points then follow Article 5 by final position.

Confirmed in practice by the score sheet `10K Points Road`, whose `شباب - بنين` block contains bib 158 (a `ناشئين` athlete) — the merge rule in effect, labelled with the senior name.

**Implementation note:** in-race points and Article 5 championship points are **different quantities** and must be stored in separate fields.

### 8.9 Elimination races — 10,000m Track and 15,000m Road

**FACT**, Table 10 r4 and Table 11 r5:
- **No qualification**; ناشئين and شباب merged.
- **10,000m Track:** 50 laps; elimination starts at **lap 45**. **15,000m Road:** elimination starts **after the first 1,000m**.
- The **last-placed** athlete in an elimination lap is eliminated.
- In the final **3, 2 and 1** laps, **exactly one** athlete is eliminated per lap.
- Between the start of elimination and those last three laps, the **elimination interval** (every 2 or 3 laps) and the **number eliminated** (one or two) are **set according to the number of entrants**, such that exactly **3 athletes remain** in the final lap.
- Top 3 placed by their order in the final lap; everyone else placed in **reverse order of elimination**.
- An athlete leaving the race for any reason is treated as the athlete eliminated in the **next** elimination lap.

**ASSUMPTION — Q13:** the interval/count schedule is explicitly left to the organiser ("according to the number of participants"). It is therefore **operator input**, not a derivable formula. Implementation must let an official enter the schedule, validate that it terminates with exactly 3 athletes, and record it with the result. Do not invent a formula.

### 8.10 Relay — 3,000m

Listed as a distance for عمومي/شباب/ناشئين in both Road and Track (Article 7, Tables 6–7). Article 5 says the **team** scores by final position. **No team size, composition, substitution, or eligibility rule is given anywhere in the sources. OPEN — Q10.** Out of MVP scope; blocked from official calculation.

---

## 9. Round dependencies

**FACT** (Article 9, first): the Qualification round precedes and feeds the League and Cup.
**FACT** (catalogue): each later round names its prerequisite — e.g. row 11 `500m: نصف النهائي – النهائي`; row 13 `100m: دور ال8 – نصف النهائي – النهائي`.

Derived prerequisite chains:

| Championship | Distance | Chain |
|---|---|---|
| NL / Cup | 100m | Qualification → R16 → R8 → Semi → Final A + Final B |
| NL / Cup | One Lap | Qualification → R16 → Semi → Final |
| NL | 500m | Qualification → R16 → Semi → Final |
| NL | 200m | Qualification → Final (level A and B) |
| NL | 800/1000m | Qualification → R24 → Semi → Final |
| Cup | 800/1000m | Qualification → R24 → **R12** → Final |
| NL | points / elimination | *(no prerequisite — direct entry)* |

- **Implementation:** `race_round_prerequisites` with a DAG, cycle rejection on write, and activation blocked until **every** prerequisite round has **approved** results.
- **Tests:** a final cannot activate while its semi is unapproved; approving the semi unblocks it; a cycle is rejected; long-distance races need no prerequisite; the blocked-activation message names the specific missing round.

---

## 10. Implementation map

| Rule | Module | Status |
|---|---|---|
| Age category by birth year | `lib/competition/rules/age-category.ts` | Fully specified |
| Points by position and category | `lib/competition/rules/points.ts` | Specified; tie-consumption OPEN (Q6) |
| Minimum 3 athletes | `lib/competition/rules/points.ts` | Fully specified |
| Eligibility per race and category | `lib/competition/rules/eligibility.ts` | Specified; long-distance categories OPEN (Q11) |
| Previous-season seeding | `lib/competition/rules/seeding.ts` | Specified; unranked placement ASSUMPTION (Q7) |
| Heat sizes and remainder | `lib/competition/rules/heats.ts` | Sizes specified; remainder ASSUMPTION (Q4) |
| 100m bracket | `lib/competition/rules/progression/sprint-100m.ts` | Fully specified |
| One Lap / 500m bracket | `lib/competition/rules/progression/four-lane.ts` | Fully specified |
| 200m time trial | `lib/competition/rules/progression/time-trial.ts` | Fully specified |
| 800/1000m bracket | `lib/competition/rules/progression/middle-distance.ts` | **BLOCKED — R24 seeding (Q1)** |
| Points races | `lib/competition/rules/progression/points-race.ts` | Fully specified |
| Elimination races | `lib/competition/rules/progression/elimination.ts` | Specified; schedule is operator input (Q13) |
| Relay | — | **BLOCKED — no rule exists (Q10)** |
| A/B classification and promotion | `lib/competition/rules/classification.ts` | Specified; promotion order OPEN (Q12) |
| Club standings | `lib/competition/rules/club-standings.ts` | Fully specified |
| Round prerequisites | `lib/competition/rules/prerequisites.ts` | Fully specified |

Every module takes an explicit `rulesetVersion` and is a pure function of its inputs — no database access, no randomness, no clock reads — so that recalculation is reproducible and past seasons are never retroactively altered.
