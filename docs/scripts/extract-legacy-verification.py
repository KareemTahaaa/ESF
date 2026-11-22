#!/usr/bin/env python3
"""Extract a verification dataset from the legacy Egypt Skate Database workbook.

Produces the JSON that lib/competition/__tests__/legacy-verification.test.ts
reads, so the rules engine can be checked against the federation's real data.

The workbook is opened READ-ONLY and no macro is ever executed. The source file
is never modified.

The output contains personal data (athlete names) and must NOT be committed.
Write it outside the repository, or to a git-ignored path.

Usage:
    pip install openpyxl
    python docs/scripts/extract-legacy-verification.py "<Egypt Skate Database.xlsm>" out.json
    LEGACY_VERIFY_JSON=out.json npm test
"""

from __future__ import annotations

import datetime
import json
import sys

import openpyxl

# Legacy `Race` labels -> the RaceCode values used by the rules engine.
# `800m-1000m` is one legacy race whose distance depends on age category
# (Article 7: `تحت 11` and below skate 800m, `تحت 12` and above 1000m).
RACE_CODES = {
    "100m": "100m",
    "One Lap": "one_lap",
    "200m": "200m",
    "500m": "500m",
    "800m-1000m": "middle",
}

# Database sheet column offsets (0-based), resolved from the header row.
DB_FEDERATION_NUMBER = 0
DB_FULL_NAME = 2
DB_CATEGORY_2025_2026 = 4
DB_CATEGORY_2026_2027 = 5
DB_BIRTH_YEAR = 8

# Records sheet column offsets (0-based).
REC_FEDERATION_NUMBER = 0
REC_RACE = 6
REC_TIME = 10


def encode_time(value):
    """Tag Excel time cells so the TypeScript side can tell them from numbers.

    openpyxl surfaces a time-formatted cell as datetime.time; JSON has no such
    type, and serialising it as a string would lose the distinction between an
    Excel time serial and a decimal-seconds string.
    """
    if isinstance(value, datetime.time):
        return {
            "__time__": True,
            "hours": value.hour,
            "minutes": value.minute,
            "seconds": value.second,
            "microseconds": value.microsecond,
        }
    return value


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    workbook_path, output_path = sys.argv[1], sys.argv[2]

    # keep_vba preserves the macro blob on read; it does NOT execute anything.
    workbook = openpyxl.load_workbook(workbook_path, data_only=True, keep_vba=True)

    athletes = []
    for row in workbook["Database"].iter_rows(min_row=2, values_only=True):
        if row[DB_FEDERATION_NUMBER] is None:
            continue
        athletes.append(
            {
                "fed": row[DB_FEDERATION_NUMBER],
                "name": row[DB_FULL_NAME],
                "cat2526": row[DB_CATEGORY_2025_2026],
                "cat2627": row[DB_CATEGORY_2026_2027],
                "yob": row[DB_BIRTH_YEAR],
            }
        )

    records = []
    unknown_races = set()
    for row in workbook["Records"].iter_rows(min_row=2, values_only=True):
        if row[REC_FEDERATION_NUMBER] is None:
            continue
        label = str(row[REC_RACE]).strip()
        code = RACE_CODES.get(label)
        if code is None:
            # Never guess a race code: an unmapped label is reported, not dropped silently.
            unknown_races.add(label)
            continue
        records.append(
            {
                "fed": row[REC_FEDERATION_NUMBER],
                "race": code,
                "time": encode_time(row[REC_TIME]),
            }
        )

    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump({"athletes": athletes, "records": records}, handle, ensure_ascii=False)

    print(f"athletes: {len(athletes)}")
    print(f"records:  {len(records)}")
    if unknown_races:
        print(f"WARNING unmapped race labels (excluded): {sorted(unknown_races)}")
    print(f"written:  {output_path}")
    print("This file contains personal data. Do not commit it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
