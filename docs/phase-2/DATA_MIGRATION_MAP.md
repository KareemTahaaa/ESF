# Phase 2 — Data Migration Map

Written **2026-10-31** from the inspected source materials. Companion to `SOURCE_MATERIALS_INVENTORY.md`.

Governing constraints, from the brief and confirmed by what the files actually contain:
- Excel is the **only** legacy source of truth. There is no legacy application database.
- **Source workbooks are never modified.** Read-only access, always.
- **No macro is ever executed.** VBA is read as text only.
- Every import goes through **preview → validation → explicit authorised commit**, inside a transaction.
- Normalisation **never discards** the original value.
- Name similarity **never** auto-merges athlete records.

---

## 1. What is being migrated

| Source | Target | Rows | Confidence |
|---|---|---|---|
| `Egypt Skate Database.xlsm → Database` | `athletes`, `club_memberships`, `athlete_previous_season_rankings` | 777 | High — unique key verified |
| `Egypt Skate Database.xlsm → Club Codes` | `clubs` | 13 in use | High |
| `Egypt Skate Database.xlsm → Age Group Codes` | `season_rulesets` (2025-26 labels) | 10 | High |
| `Egypt Skate Database.xlsm → Records` | `historical_results` | 3476 | Medium — time formats, no positions |
| `Races 2026-2027.docx` | `race_catalogue` | 24 | High |
| `2026-2027.docx` | `season_rulesets` (2026-27 rules) | — | High, except Q1 |
| Start list / score sheet workbooks | **not migrated** — output format references | — | — |
| Club entry forms | **not migrated** — workflow references | — | — |

Nothing in Sanity is migrated. Editorial content stays where it is.

---

## 2. Clubs

**Source:** `Club Codes` (754 rows, mostly empty) joined against clubs actually referenced in `Database` and `Records`.

| Target column | Source | Notes |
|---|---|---|
| `name_ar` | `النادي` | Verbatim, the display name |
| `name_normalised` | derived | For matching only — see §5 |
| `code` | `Club Code` | 3–4 letters: `WDC`, `TGC`, `SSC`, `MSC`, `MYC`, `AERO`, `NCSC`, `ZSC`, `OSC`, `NPC`, `SUD`, `AESC` |
| `is_foreign` | derived | `الاتحاد السوداني العام` (SUD) is a foreign federation, not an Egyptian club |

13 clubs appear in `Records`, by result volume: وادي دجلة 1850, طلائع الجيش 427, الشمس 290, المقطم 215, ايروسبورت 169, مركز شباب المدينة 128, الزهور 126, العبور 125, الصيد بالاسكندرية 57, الاتحاد السوداني العام 36, النصر للبترول 28, سيتي كلوب 18, مدينة نصر 7.

Club names are spelled **consistently** across `Database`, `Records`, the start lists, and the entry forms — a cross-file check of all 442 start-list rows against `Database` found **0 club conflicts**. Normalisation is still applied for matching, but no manual reconciliation is expected.

`ايروسبورت` (AERO) is both a club and a Road **venue** in the race catalogue. These are distinct entities and must not be conflated.

**Validation:** club code unique; club name unique after normalisation; a club referenced in `Records` but absent from `Club Codes` is a rejected row, not an auto-created club.

---

## 3. Athletes

**Source:** `Database` sheet, 777 rows.

| Target column | Source | Notes |
|---|---|---|
| `federation_number` | `الرقم` | **Primary stable key.** Verified unique across all 777 rows — zero duplicates |
| `registration_number` | `رقم التسجيل` | Opaque secondary id, stored verbatim. Prefix unexplained (Q9) |
| `full_name_ar` | `الأسم` | Verbatim, authoritative display name |
| `first_name`, `last_name` | `first name`, `last name` | See §3.1 — **not** reliable |
| `birth_year` | `YOB` | **16 rows null** (Q14) |
| `gender` | `Gender` / `النوع` | `M`/`F`; Arabic `بنين`→M, `بنات`→F |
| `name_normalised` | derived | Duplicate **detection** only — never auto-merge |

Deliberately **not** imported as athlete fields:
- `المرحلة 2025-2026` / `المرحلة 2026-2027` — age category is **derived** from `birth_year` + season ruleset, never stored as an athlete attribute. Both columns are kept on the import row for verification (see §3.2).
- `Age Group Code` (1–10) — a season-specific legacy code, mapped into `season_rulesets`, not onto the athlete.
- `الرقم` duplicate column (position 7) — identical to column 1 in all rows; ignored.

### 3.1 `first name` / `last name` are unreliable
Splitting `الأسم` into the sheet's own `first name`/`last name` loses tokens. Athlete 1654: `الأسم` = `فرح رأفت عبدالشكور سلامة` but `first name` + `last name` = `فرح` + `رأفت عبدالشكور` — the final token `سلامة` is dropped. Athlete 1168 loses `اسماعيل` likewise.

**Decision:** `full_name_ar` is authoritative. The split columns are imported for reference but never used for matching, display, or document generation. Arabic names here run to 4–5 tokens (given name + patronymic chain) and do not map onto a first/last model.

### 3.2 Category verification instead of category import
Applying the Article 3 table to the 761 athletes with a `YOB` reproduces the sheet's `المرحلة 2026-2027` column with **0 mismatches** across all 761 rows.

The import therefore **recomputes** the category and **asserts** it matches the sheet. A mismatch is an import error requiring review, not a silent overwrite. This turns a 777-row spreadsheet into a regression test for the rules engine.

### 3.3 Club membership is versioned, not a column
`Database.النادي` gives only the athlete's **current** club. Article 8 requires points to count for the club the athlete represented **at the time of the result**, so:

```
club_memberships(athlete_id, club_id, season_id, valid_from, valid_to)
```

Migration seeds one row per athlete for season 2026-27 from `Database.النادي`, plus one row per athlete for 2025-26 from the club recorded in their `Records` rows. Where an athlete's `Records` club differs from their current `Database` club, that is a genuine transfer and both memberships are created. Historical results then reference the membership, so a later transfer never rewrites past standings.

### 3.4 Duplicate detection
`الرقم` is unique, so there are no duplicates by key. Name-based detection still runs to catch the same person registered twice under two numbers:

1. Exact match on `name_normalised` + `birth_year` → **high confidence**, queued for review.
2. Exact `name_normalised`, different `birth_year` → **possible duplicate**, queued.
3. Normalised-name similarity ≥ 0.9 (trigram) → **low confidence**, listed only.

All three **only produce a review queue**. No automatic merge, ever, per the brief.

---

## 4. Historical results — the hard part

**Source:** `Records` sheet, 3476 rows.

| Target column | Source | Notes |
|---|---|---|
| `athlete_id` | `No` → `athletes.federation_number` | Join key |
| `club_membership_id` | `Club` + `Season` | Club **at the time** |
| `race_code` | `Race` | `100m`, `One Lap`, `800m-1000m`, `200m`, `500m` |
| `championship` | `Event` | `نهائيات الدوري العام` / `تصفيات الدوري العام` |
| `season` | `Season` | `موسم 2025-2026` only |
| `result_date` | `Date` | All 3476 are proper datetimes, 2025-12-19 → 2026-06-19 |
| `time_centiseconds` | `Time` | **Normalised — see §4.1** |
| `time_raw` | `Time` | Original cell value, verbatim, always retained |
| `status` | `Time` | `OK` / `DQ` / `FS` — see §4.2 |
| `final_position` | — | **Does not exist in the source** |

### 4.1 Time normalisation
The `Time` column holds **11 formats across 4 Python types**. The canonical target is an **integer count of centiseconds**, chosen because all source precision is 0.01 s and integers avoid float drift in comparisons and sorting.

| Form | Count | Rule | Example → cs |
|---|---|---|---|
| `float` | 992 | seconds | `15.34` → 1534 |
| `int` | 37 | seconds | `48` → 4800 |
| `str` `"SS.hh"` (leading space) | 1109 | trim, seconds | `" 15.34"` → 1534 |
| `str` `"SS.h"` | 12 | trim, seconds | `" 16.8"` → 1680 |
| `str` `"'SS.hh"` | 1 | strip leading `'`, seconds | `"'14.11"` → 1411 |
| `str` `"M:SS.hh"` | 201 | colon = min:sec | `" 1:00.89"` → 6089 |
| `str` `"M.SS.hh"` | 759 | **two dots** = min.sec.cs | `"1.50.50"` → 11050 |
| `str` `"M.SS.h"` | 6 | two dots, 1-dec cs | `"2.52.5"` → 17250 |
| `str` `"M,SS.hh"` | 1 | comma = min separator | `"1,39.88"` → 9988 |
| `datetime.time` | 356 | `(h*3600+m*60+s)*100 + µs/10000` | `00:01:00.910` → 6091 |
| `str` `"FS"`, `"DQ"` | 1 each | **status, not a time** | → `NULL` + status |

**The two-dot form is the trap.** `"1.50.50"` is 1 min 50.50 s, but a careless `parseFloat` yields `1.5`. Disambiguation is structural and safe: **count the dots**. One dot (or none) = decimal seconds; two dots = `M.SS.hh`. Verified against the data — every two-dot value is in `800m-1000m` or `One Lap`, where minute-scale times are expected, and no `100m`/`200m` value has two dots.

**Plausibility guards** reject rather than silently accept. Observed ranges in the source:

| Race | Observed min–max | Accepted band |
|---|---|---|
| `100m` | 9.50 – 22.94 s | 8 – 40 s |
| `200m` | 18.63 – 42.56 s | 15 – 80 s |
| `500m` | 43.65 – 59.94 s | 35 – 150 s |
| `One Lap` | 37.04 – 75.60 s | 30 – 180 s |
| `800m-1000m` | minute-scale only | 60 – 600 s |

A parsed value outside its band is a **rejected row with a validation issue**, never a coerced guess. This is what catches a misparsed `"1.50.50"` → 1.5 s in `800m-1000m`: 1.5 s is far below the 60 s floor.

Confirming the per-race split: `800m-1000m` has **zero** plain-numeric values (558 strings + 270 Excel times), while `100m` is 443 numerics + 486 strings and none are Excel times. The formats cluster by race, as expected from how each sheet was filled in.

### 4.2 Status codes
`FS` and `DQ` appear once each. Both import with `time_centiseconds = NULL`, `status` set, and `time_raw` preserved. Their **sporting** effect is undefined (Q3) — any race containing them is flagged and blocked from official points publication.

### 4.3 Historical positions do not exist
`Records` has **no finishing-position column**. The brief asks to preserve "time, position, and status where available" — position simply is not available. Consequences:
- `final_position` is `NULL` for all 3476 historical rows.
- Historical results **cannot** retroactively generate Article 5 championship points. Correct anyway: the brief states historical time data must not change points-based season rankings.
- The `ترتيب` columns in the `Database` sheet are the only previous-season rankings available, and they are per-race aggregates, not per-result placings. They migrate separately (§4.4).

### 4.4 Previous-season rankings — the seeding input
This is what Article 9 Table 9 actually needs. Source: the 5 `تصنيف` (A/B level) and 6 `ترتيب` (rank) columns of `Database`.

```
athlete_previous_season_rankings(athlete_id, season_id, race_code, championship,
                                 classification_level, rank, rank_raw, needs_review)
```

| Source column | Target `race_code` | `championship` | Values | Coverage |
|---|---|---|---|---|
| `تصنيف/ترتيب 100m Road` | `100m` | League | A/B + rank | 777 / 513 |
| `تصنيف/ترتيب 200m Track` | `200m` | League | A/B + rank | 777 / 513 |
| `تصنيف/ترتيب One Lap Road` | `One Lap` | League | A/B + rank | 777 / 518 |
| `تصنيف/ترتيب 500m Track` | `500m` | League | A/B + rank | 777 / 518 |
| `ترتيب 800m-1000m Track League` | `800m-1000m` | League | rank | 380 |
| `ترتيب 800m-1000m Track Cup` | `800m-1000m` | Cup | **corrupt** | 517 |

Two findings carried into the import:

- **Coverage is partial by design.** Only 513–518 of 777 athletes are ranked per race (380 for League 800/1000m), so roughly a third of the field is unranked and falls to the Q7 default (seeded last, ordered by federation number). This is the normal case, not an error.
- **`ترتيب 800m-1000m Track Cup` is corrupt (Q2).** 138 of 517 values are the strings `Heat 1`…`Heat 8` rather than ranks. Every non-numeric value imports to `rank = NULL`, `rank_raw` = the original string, `needs_review = true`. **Never coerced.** The 138 affected athletes are excluded from automatic Cup 800/1000m seeding and listed for federation resolution.

Note also that `Classifications` lists only four classification sets (100m Road, 200m Track, One Lap Road, 500m Track) — there is no 800/1000m A/B classification, even though the regulations and catalogue describe a level B for that distance. The `تصنيف 800m-1000m Track` column exists in `Database` and is imported, but its absence from `Classifications` is noted for the federation.

---

## 5. Arabic normalisation

Applied for **matching only**; the original is always stored.

1. Trim and collapse internal whitespace — required: `Time` strings carry leading spaces.
2. Strip the Excel text-escape apostrophe (`'14.11`).
3. Alef forms: `أ إ آ ٱ` → `ا`.
4. Yeh: `ى` → `ي`. Teh marbuta: `ة` → `ه`.
5. Remove tatweel `ـ`, harakat, and zero-width characters.
6. Arabic-Indic digits `٠١٢٣٤٥٦٧٨٩` → ASCII.

Observed variants that make this mandatory:

| Variant A | Variant B | Difference |
|---|---|---|
| `اشبال 11 (2015)` (`Age Group Codes`) | `أشبال 11 (2015)` (`Start List`) | hamza |
| `صاعدين 14 (2012)` (2025-26) | `تحت 14` (2026-27 regs) | naming scheme |
| `شباب (2008-2009)` (2025-26) | `شباب` (`Records`, regs) | birth-year suffix |

Category labels need an explicit **season-scoped mapping table**, not string matching:

| 2025-26 legacy label | Code | 2026-27 label |
|---|---|---|
| `عمومي` | 1 | `عمومي` |
| `شباب (2008-2009)` | 2 | `شباب` |
| `ناشئين (2010-2011)` | 3 | `ناشئين` |
| `صاعدين 14 (2012)` | 4 | `تحت 14` |
| `صاعدين 13 (2013)` | 5 | `تحت 13` |
| `صاعدين 12 (2014)` | 6 | `تحت 12` |
| `اشبال 11 (2015)` | 7 | `تحت 11` |
| `اشبال 10 (2016)` | 8 | `تحت 10` |
| `اشبال 9 (2017)` | 9 | `تحت 9` |
| `اشبال 8 (2018)` | 10 | `تحت 8` |

**This mapping is a label mapping, not a cohort mapping.** The birth-year ranges differ between seasons, so a 2025-26 `ناشئين` (born 2010–2011) becomes a 2026-27 `شباب` (2009–2010) **or** `ناشئين` (2011–2012) depending on the actual year. Category is always recomputed from `birth_year` against the target season's ruleset — the previous label is never carried forward.

---

## 6. Columns that must not be migrated

| Source | Why not |
|---|---|
| `Start List.year` | **Not a birth year.** Verified: one fixed value per category across all 442 rows (`عمومي`→2007, `شباب (2008-2009)`→2008, …). It is a category **anchor** year. Migrating it as DOB produces 85 false conflicts against `Database.YOB` (e.g. athlete 2358 has `YOB` 2001, anchor 2007). |
| `Start List.Event`, `.Heat` | Generated output of a past round, not master data. Regenerated by the rules engine. |
| `Sheet2` | A PivotTable cache of `Records`. Derived; recomputed by query. Its own note admits sub-1 values are mishandled. |
| `Min Holders` | Derived from `Records`. Recomputed. Its note warns that zero and sub-1 times are "treated as-is", i.e. it reproduces the §4.1 defect. |
| `Database.Age Group Code` | Season-specific legacy code → `season_rulesets`, not an athlete attribute. |
| `Database.المرحلة 2025-2026/2026-2027` | Derived from birth year. Kept on the import row to verify the engine (§3.2), not stored on the athlete. |
| `Database.first name`/`last name` | Lossy (§3.1). Reference only. |
| Club entry forms | Workflow references. Their `مشارك`/`غير مشارك` entries are a past round's registrations, superseded by the new UI. |

---

## 7. Import pipeline

Four stages, with the commit gated on human authorisation.

**1 — Upload and fingerprint.** Store the file, compute a **SHA-256 content hash**, and record filename, uploader, and timestamp. A hash already committed is **rejected as a duplicate**.

> Directly justified by the materials: `400m.xlsx` and `الشمس الجوله الثالثه 400m.xlsx` are **byte-identical** (both `cfe5bace26fa06da…`). Filename-based deduplication would have imported the same 69 athletes twice.

**2 — Parse and map.** Open read-only with `keep_vba` and **never execute** macros. Resolve sheets and columns through an explicit, stored mapping per workbook type (legacy headers contain embedded newlines, e.g. `المرحلة\n2025-2026`, so header matching must normalise whitespace). Unmapped columns are reported, never silently dropped.

**3 — Validate into a preview.** Every row lands in `import_rows` with a status and zero or more `validation_issues`:

| Status | Meaning |
|---|---|
| `accepted` | Valid, commits as-is |
| `warning` | Commits, flagged for review (e.g. unranked athlete, partial coverage) |
| `needs_review` | Commits with `needs_review = true` (e.g. the 138 `Heat N` ranks) |
| `rejected` | Does not commit (unparseable time, time outside the plausibility band, unknown club, missing federation number) |
| `suspected_duplicate` | Held for a merge decision; never auto-merged |

The preview reports counts per status, every unmapped column, and the full issue list. Expected first-run figures from the inspected data:

| Check | Expected |
|---|---|
| Athletes parsed | 777 |
| Athletes with unresolved category (no `YOB`) | **16** (Q14) |
| Category recomputation mismatches | **0** |
| Duplicate federation numbers | **0** |
| Historical results parsed | 3476 |
| Results with non-`OK` status | **2** (`FS`, `DQ`) |
| Results with `final_position` | **0** (not in source) |
| Previous-season ranking rows needing review | **138** (Q2) |
| Clubs | 13 |

**4 — Authorised commit.** A federation admin reviews the preview and confirms. The commit runs in **one transaction**: insert rows, write an `import_batches` record (file hash, operator, timestamp, per-status counts, outcome), and link every created row to its `import_row` for provenance. Any failure rolls the whole batch back.

**Re-import and correction.** A corrected workbook has a different hash, so it is accepted. It is matched to the prior batch on `federation_number`, producing an update-or-insert diff rather than duplicates. Committed batches are never deleted; a superseding batch references the one it corrects.

---

## 8. Testing

Per the brief, automated tests use **synthetic** records — no real athlete data in fixtures.

**Unit** — each of the 11 time formats parses to the expected centisecond value; the two-dot/one-dot disambiguation; each plausibility band rejects out-of-range values; `FS`/`DQ` yield a null time plus status; each Arabic normalisation rule; every category-label mapping; the lossy name split is never used for matching.

**Integration** — preview of a synthetic workbook produces exact per-status counts; committing twice with the same content hash is rejected the second time (the `400m.xlsx` duplicate case); a corrected re-import updates instead of duplicating; a mid-batch failure rolls back completely; provenance resolves from a committed athlete back to its source row; a `needs_review` ranking row does not reach the seeding engine.

**Verification against real data** (run manually, not committed as a fixture) — the 777-row category recomputation must reproduce the sheet with 0 mismatches; all 3476 times must parse or be explicitly rejected with a reason, with zero silent coercions.
