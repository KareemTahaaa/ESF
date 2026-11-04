#!/usr/bin/env python3
"""Extract the season race catalogue from `Races 2026-2027.docx` into JSON.

The catalogue is loaded from the federation's own document rather than retyped,
so a corrected document can be re-extracted without hand edits. The source file
is opened read-only.

Usage:
    pip install python-docx
    python docs/scripts/extract-race-catalogue.py "<Races 2026-2027.docx>" lib/competition/data/race-catalogue-2026-2027.json
"""

import json
import sys

from docx import Document

CHAMPIONSHIPS = {
    "جولة التصفيات": "qualifications",
    "الدوري العام": "national_league",
    "كأس مصر": "egypt_cup",
}
SURFACES = {"Track": "track", "Road": "road"}


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    table = Document(sys.argv[1]).tables[0]
    rows = []
    for row in table.rows[1:]:
        cells = [" ".join(c.text.split()) for c in row.cells]
        number, championship, venue, surface, race, rule = cells[:6]
        if championship not in CHAMPIONSHIPS or surface not in SURFACES:
            # Never guess a mapping: an unknown label stops the extraction.
            raise SystemExit(f"Unmapped value in row {number}: {championship!r} / {surface!r}")
        rows.append(
            {
                "number": int(number),
                "championship": CHAMPIONSHIPS[championship],
                "championshipAr": championship,
                "venueAr": venue,
                "surface": SURFACES[surface],
                "raceAr": race,
                "ruleAr": rule,
            }
        )
    with open(sys.argv[2], "w", encoding="utf-8") as handle:
        json.dump({"season": "2026-2027", "source": "Races 2026-2027.docx", "races": rows}, handle, ensure_ascii=False, indent=2)
    print(f"{len(rows)} races written to {sys.argv[2]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
