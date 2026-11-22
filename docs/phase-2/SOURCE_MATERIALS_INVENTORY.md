# Phase 2 — Source Materials Inventory

Inspected **2026-10-31** from `c:\Users\karee\Downloads\materials source`.
Extraction was read-only. **No macro was ever executed.** VBA was recovered as text via `oletools.olevba` (static parse of `vbaProject.bin`).

---

## 1. Inventory and status

| File | Size | Status | What it actually is |
|---|---|---|---|
| `2026-2027.docx` | 240 KB | **Inspected** | Official 2026–2027 speed-skating regulations. 9 articles, 12 tables, 18 nested tables. The authoritative rule source. |
| `.pdf` *(filename is literally `.pdf`)* | 340 KB | **Inspected** | 12-page PDF, `Lang(en)`, PDF 1.7. Same regulations content — the "equivalent PDF" named in the brief. Has no filename stem, so extension-based tooling fails on it; must be renamed before use. |
| `Races 2026-2027.docx` | 23 KB | **Inspected** | The season race catalogue: one 25×6 table = 24 races. |
| `Egypt Skate Database.xlsm` | 1.1 MB | **Inspected** | The legacy system of record. 9 sheets + **31 VBA modules (~600 KB of code)**. Athlete registry, historical results, club/age lookups, and the start-list/score-sheet generators. |
| `Start List -    -   -  2025-2026.xlsx` | 52 KB | **Inspected** | Generated start lists, 2025-26 National League round 4. 3 sheets. Output-format reference. |
| `Score Sheets -    -   -  2025-2026.xlsx` | 50 KB | **Inspected** | Matching printable score sheets. 3 sheets. Output-format reference. |
| `(4).xlsx` | 14 KB | **Inspected** | Club race-entry form, club الزهور, 58 athletes. |
| `400m.xlsx` | 14 KB | **Inspected** | Club race-entry form, club الشمس, 69 athletes. **Filename is misleading** — contains no 400 m data. |
| `الشمس الجوله الثالثه 400m.xlsx` | 14 KB | **Inspected** | **Byte-identical duplicate of `400m.xlsx`** (SHA-256 both `cfe5bace26fa06da…`). |
| `Egypt_Skate_Federation_Phase_2_Requirements.pptx` | — | **Inspected 2026-11-01** | Supplied after the first audit (without the `(1)` suffix). A **blank** 13-slide client questionnaire (October 2026): scope, disciplines, athlete identification, age-category basis, ranking structure, registration deadlines and approval, Excel import workflow, roles, language/RTL, Phase 1 preservation, launch priorities. **No options are ticked and no notes are filled in**, so it records the questions asked, not the federation's answers. No requirement is taken from it; the confirmed decisions in the brief govern. |

Two cautions carried into the migration design:
- **Filenames are not evidence.** `400m.xlsx` holds One Lap Road / 10K entries; `(4).xlsx` is an export artifact name.
- **Byte-identical duplicates circulate.** Direct justification for content-hash-based duplicate-import prevention.

---

## 2. `2026-2027.docx` — regulations

Nine articles (note: the source numbers **two different articles as "المادة 9"** — a defect in the official document; see `../rules/OPEN_QUESTIONS.md` Q8).

| Article | Subject | Tables |
|---|---|---|
| 1 | Championship organisation (federation exclusive right; venues/dates announced at season start) | — |
| 2 | Registration rules (federation-registered athletes may enter per their age category) | — |
| 3 | **Age categories by birth year** | Table 1 (11×4) |
| 4 | Competitions and permitted categories | Table 2 (4×3) |
| 5 | **Points** | Table 3 (11×9) |
| 6 | Individual prizes | Table 4 |
| 7 | Race distances per championship | Tables 5–8 |
| 8 | **Club standings** | — |
| 9 (first) | **Qualification-round heat division** | Table 9 (6×3) |
| 9 (second) | **National League and Cup progression** | Tables 10–12 + 18 nested tables |

The 18 nested tables inside Tables 10–12 are the **concrete heat/lane seeding patterns** (e.g. `Heat 1 = الأول / السادس عشر`). They are the single most important extraction in this audit and are transcribed in `../rules/RULE_MATRIX.md`.

### 2.1 The regulations are incomplete as shipped
`word/document.xml` contains **24 literal U+2026 (`…`) characters**, verified present in the source file rather than introduced by extraction. They appear in the four 6-heat seeding tables for **800 m/1000 m Track round-of-24** (National League and Egypt Cup), where the per-heat athlete lists are truncated:

```
R1C0: ['أول heat 1', '…']
R1C3: ['أول heat 4', 'أول heat 9', '…']
```

The round-of-24 and its semi-final seeding therefore **cannot be derived from the document**. Blocking open question Q1.

### 2.2 Other content
One embedded image (`word/media/image1.png`, 180 KB) — federation branding, no rule content.

---

## 3. `Races 2026-2027.docx` — race catalogue

A single 25-row table (header + **24 races**). Columns: `#`, championship, venue (المكان), type (النوع), races (السباقات), qualification/progression rule.

- **Championships:** جولة التصفيات (Qualifications) 1–5, الدوري العام (National League) 6–18, كأس مصر (Egypt Cup) 19–24.
- **Venues:** مدرسة بن مسعود (Track), ايروسبورت (Road).
- **Type:** `Track` or `Road`, matching the regulations.
- The sixth column carries explicit qualification targets, e.g. `تصفيات 200m – يتأهل أفضل 12 زمن` (best 12 times advance), `دور ال 16 يتأهل المركز الأول والثاني لكل heat – (8 متأهلين)`.

Fully transcribed in `../rules/RULE_MATRIX.md` §7. This file is parseable and must be loaded programmatically, not retyped.

---

## 4. `Egypt Skate Database.xlsm` — the legacy system of record

| Sheet | Size | Role |
|---|---|---|
| `Main` | 5×5 | Run configuration: race name, **athletes per heat**, date, minutes per heat. Drives the VBA generators. |
| `Age Group Codes` | 16×3 | 2025-26 category label → division code 1–10 → normalised short label. |
| `Database` | **778×25** | **Athlete master registry — 777 athletes.** |
| `Gender Codes` | 2×2 | `بنين`→M, `بنات`→F. |
| `Club Codes` | 754×3 | Arabic club name → 3–4 letter code. |
| `Classifications` | 4×1 | Only four classification lists exist: 100m Road, 200m Track, One Lap Road, 500m Track. **No 800/1000m classification.** |
| `Records` | **3477×11** | **Historical results — 3476 rows.** |
| `Sheet2` | 37×8 | PivotTable: min time by category/gender/race. |
| `Min Holders` | 99×6 | Record holders, derived from `Records`. Its own Arabic note warns that zero and sub-1 time values are "treated as-is, exactly like the current Pivot" — the legacy file documents its own data-quality defect. |

### 4.1 `Database` sheet — 25 columns
`الرقم` (federation no.) · `رقم التسجيل` (registration no.) · `الأسم` · `النادي` · `المرحلة 2025-2026` · `المرحلة 2026-2027` · `الرقم` (dup) · `النوع` · `YOB` · `first name` · `last name` · `Club` (code) · `Age Group Code` · `Gender` · **5× `تصنيف`** (A/B classification per race) · **6× `ترتيب`** (ranking per race; 800/1000m split into `Cup` and `League`).

Measured quality:
- **777 athlete rows, zero duplicate `الرقم`.** Federation number is a usable stable key.
- `رقم التسجيل` is `{prefix}/{number}` — prefix `2` ×773, prefix `5` ×4. Prefix meaning unconfirmed (Q9).
- **16 athletes have no `YOB` and no 2026-2027 category.** All are 2025-26 `ناشئين` or `تحت 8`. They cannot be assigned a category and so cannot be entered in 2026-27 races until resolved.
- **For all 761 athletes with a `YOB`, the 2026-2027 category column matches the official rulebook exactly — 0 mismatches.** Independent confirmation that the Article 3 table is correctly implemented.
- **`ترتيب 800m-1000m Track Cup` is corrupt: 138 of 517 values are strings like `Heat 1`…`Heat 8`, not ranks.** The column conflates final ranking with heat allocation and cannot be used for seeding as-is (Q2).
- Ranking coverage is partial: 513–518 of 777 athletes per race; the League 800/1000m column has only 380.

### 4.2 `Records` sheet — historical results
Columns: `No` · `Name` · `Club` · `No` (dup) · `Age Group` · `Gender` · `Race` · `Event` · `Season` · `Date` · `Time`.

- **3476 rows, one season only (`موسم 2025-2026`)**, dates 2025-12-19 → 2026-06-19.
- Races: `100m` 929, `One Lap` 856, `800m-1000m` 828, `200m` 468, `500m` 395.
- Events: only `نهائيات الدوري العام` (NL finals) 1999 and `تصفيات الدوري العام` (NL qualifications) 1477. **No Egypt Cup results exist.**
- 13 distinct clubs, consistently spelled; includes a foreign entry (`الاتحاد السوداني العام`).
- **There is no finishing-position column — only `Time`.** Historical *placings* are not recoverable from this sheet; the brief's "position where available" is simply not available.

#### The `Time` column holds 11 distinct formats across 4 Python types
| Form | Count | Meaning |
|---|---|---|
| `float` e.g. `15.34` | 992 | decimal seconds |
| `str " 15.34"` (leading space) | 1109 | decimal seconds |
| `str "1.50.50"` | 759 | **M.SS.hh — dot-separated** |
| `datetime.time` | 356 | Excel time serial |
| `str " 1:00.89"` | 201 | M:SS.hh |
| `int` | 37 | integer seconds |
| `str " 16.8"` | 12 | 1-decimal seconds |
| `str "2.52.5"` | 6 | M.SS.h |
| `str "'14.11"` | 1 | Excel text-escape apostrophe |
| `str "1,39.88"` | 1 | comma separator |
| `str "FS"`, `str "DQ"` | 1 each | **status codes, not times** |

Per-race ranges confirm the split: `100m` 9.50–22.94 s (all plain decimals); `800m-1000m` has **zero** plain numerics (558 strings + 270 Excel times); `500m` mixes all three. Normalisation rules and the plausibility guards: `DATA_MIGRATION_MAP.md` §4.

`FS` (false start) and `DQ` (disqualification) appear in the data but **the regulations define no DNS/DNF/DQ handling** (Q3).

### 4.3 VBA — 31 modules, read as text, never executed
Three entry points plus a Round-5 family:

| Module / Sub | What it does |
|---|---|
| `Module1.CreateClubFiles` | Writes one entry-form workbook per club from `Database`, resolving columns by Arabic header text. The legacy "club roster" distribution step. |
| `Module2.GenerateStartLists` | Builds start lists from `Main` config + participation markers. |
| `Module3.ProcessClubRegistrations` | Ingests returned club entry forms; validates; counts per club; accumulates rejection reasons (`AddReason`). The legacy import pipeline. |
| `M_Round5_StartList_ClassA/B`, `M_Round5_ScoreSheets_ClassA/B`, `M_Round5_HeatsSummary`, `M_Round5_Shared` | Per-round, per-class generators — Class A on a bracket layout, Class B on single-round balanced heats. |

Two behaviours matter, and they pull in opposite directions:

1. **`GenerateStartLists` assigns heats at random.** At `Module2` lines 459–462:
   ```vba
   ' Randomize participants within group
   ShuffleArray arr
   sizes = BuildHeatSizes(UBound(arr) - LBound(arr) + 1, perHeatSize)
   ```
   `ShuffleArray` is a `Randomize`-seeded Fisher-Yates. The 2026-2027 regulations (Article 9, Table 9) instead require heats seeded **on the previous season's National League results for the same distance**. The legacy macro therefore **does not implement the current rules and must not be ported.** This is the clearest case in the materials of legacy code whose behaviour must be documented and then deliberately rejected.

2. **`BuildHeatSizes(total, perHeat)` is worth keeping.** It computes `numHeats = ceil(total / perHeat)` then distributes `total` evenly across them (`baseSize + 1` for the first `remainder` heats), explicitly to avoid a tiny final heat — 10 athletes at 4 per heat give 4/3/3, not 4/4/2. The regulations say only "divide into heats of N" and never define remainder handling, so this is a documented, defensible default for a genuine gap (Q4).

3. **`ComputeClassABracket` invents a reduced bracket for small fields.** For 100m: `n ≥ 9` → Round of 16, `n ≥ 5` → Quarter-Final, `n ≥ 3` → Semi-Final, `n = 2` → Final A. The regulations assume a full 16-athlete bracket and are silent on short fields. Legacy default recorded for federation confirmation (Q5).

---

## 5. Start list and score sheet — output templates

Both workbooks share sheets named by race **and classification level**: `One Lap Road-B`, `One Lap Road-A`, `10K Points Road`.

### 5.1 Start list — flat table, 14 columns
Header row 1: `الرقم | الأسم | النادي | المرحلة | النوع | num | year | first name | last name | Club | Age Group Code | Gender | Event | Heat`

`One Lap Road-A` 261 athletes, `-B` 168, `10K Points Road` 13. `Event` is `Event 1`…`Event 25`, one per category×gender; `Heat` is `Heat 1`…`Heat n`. In `10K Points Road` **both `Event` and `Heat` are empty** — a single mass-start pack, consistent with the no-qualification rule for long distances.

**The `year` column is not a date of birth.** Verified: each category label maps to exactly one fixed `year` across all 442 rows — `عمومي`→2007, `شباب (2008-2009)`→2008, `ناشئين (2010-2011)`→2010, …, `أشبال 8 (2018)`→2018. It is the category's **anchor year**. A naive comparison against `Database.YOB` produces 85 false "conflicts" (e.g. athlete 2358 has `YOB` 2001 but `year` 2007). This column must **never** be migrated as a birth year.

### 5.2 Score sheet — printable, 6 columns
```
R1  بطولة الدوري العام - الجولة الرابعة - موسم 2025-2026   (merged A:F)
R2  19 يونيو2026                                           (merged A:F)
R3  One Lap Road - B                                        (merged A:F)
R5  Event 21 - عمومي - بنات                                 (merged A:F)
R7  Heat 1
R8  Lane | Bib | Name | Club | الزمن | الترتيب
R9  1 | 870 | سلمي محمد حامد محمد | وادي دجلة |      |
```
`الزمن` (time) and `الترتيب` (position) are **deliberately blank** — officials fill them by hand. Every block header is merged across A:F. The `10K Points Road` variant replaces `Lane` with `No.` and drops the `Heat` row.

### 5.3 The score sheet confirms the category-merge rule
In `10K Points Road`, the block headed `شباب - بنين` contains bib `158`, whom the start list lists as `ناشئين (2010-2011)`. This is the Article 9 rule `مع ضم المراحل السنية للناشئين والشباب` (merge Youth and Junior) in effect, and it shows the merged block is **labelled with the senior name** `شباب`. Independent confirmation of a rule that is otherwise only prose.

---

## 6. Club entry forms

All three share one layout. Header row 2: `الرقم | الأسم | النادي | النوع | المرحلة | تصنيف One Lap Road | One Lap Road | 10K Points Road`

| File | Club | Athletes | Markers |
|---|---|---|---|
| `(4).xlsx` | الزهور | 58 | `غير مشارك` 99, `مشارك` 17 |
| `400m.xlsx` | الشمس | 69 | `مشارك` 30, `غير مشارك` 39, blank 69 |
| `الشمس الجوله الثالثه 400m.xlsx` | الشمس | 69 | identical — same SHA-256 |

Each row is one athlete; each race column is marked `مشارك` (entering) / `غير مشارك` (not entering) / blank. Confirms the legacy registration flow: the federation distributes a per-club form (`CreateClubFiles`), the club marks entries, and the federation ingests the returned file (`ProcessClubRegistrations`). Phase 2 replaces that round trip with an authenticated UI, and the `مشارك`/`غير مشارك` vocabulary should be preserved in the interface.

Each form carries the club's **own roster only** — the legacy precedent for club-level data isolation.

---

## 7. Arabic label normalisation required

The same category appears with different orthography across files, so matching must normalise before comparing:

| Variant A | Variant B | Difference |
|---|---|---|
| `اشبال 11 (2015)` (`Age Group Codes`) | `أشبال 11 (2015)` (`Start List`) | hamza `ا` vs `أ` |
| `صاعدين 14 (2012)` (2025-26 legacy) | `تحت 14` (2026-27 regs) | different naming scheme |
| `شباب (2008-2009)` (2025-26) | `شباب` (`Records`, 2026-27 regs) | with/without birth-year suffix |

Also required: alef forms (`أ إ آ` → `ا`), yeh (`ى` → `ي`), teh marbuta (`ة` → `ه`), tatweel and diacritic stripping, and leading/trailing whitespace (the `Time` strings carry leading spaces). Normalisation must be used for **matching only** — the original value is always retained, per the brief.

---

## 8. What the materials do and do not establish

**Established by the sources:**
- Age categories by birth year for 2026-27 (Article 3), independently cross-validated against 761 real athlete records with zero mismatches.
- The points table for positions 1–8 by category (Article 5); the ≥3-athlete threshold; equal points for tied positions; relay points by team position.
- Club standings from summed athlete points, computed **per championship**, for the National League and Egypt Cup **only** (Article 8).
- Qualification-round heat sizes per race: 100m→2, One Lap→4, 200m→1, 500m→4, 800/1000m→4 (Table 9).
- Full seeding and advancement patterns for 100m, One Lap, 200m, and 500m (Tables 10–12 + nested tables).
- Points-race and elimination-race scoring procedures (Article 9 prose).
- The 24-race season catalogue with per-race qualification targets.
- Start-list and score-sheet output layouts.

**Not established — must not be invented:**
- 800/1000m round-of-24 and semi-final seeding (truncated with `…` in the official file) — Q1.
- DNS / DNF / DQ / FS handling for points and advancement — Q3, despite `FS` and `DQ` appearing in the data.
- Heat remainder handling when entries are not a multiple of the heat size — Q4.
- Bracket behaviour when fewer than 16 athletes qualify — Q5.
- The meaning of the corrupt `Heat N` values in `ترتيب 800m-1000m Track Cup` — Q2.
- Tie-breaks beyond the points-race "position in the final lap" rule — Q6.
- Seeding for athletes with no previous-season National League result in that distance — Q7 (the brief says "placed last"; the regulations do not say).
- Relay team composition and eligibility (`3,000m relay` is listed as a distance with no procedure given) — Q10.

All open questions are tracked with their exact source references in `../rules/OPEN_QUESTIONS.md`.
