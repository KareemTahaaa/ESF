/**
 * Arabic text normalisation for MATCHING only — DATA_MIGRATION_MAP.md §5.
 *
 * The original text is always stored and displayed; this form is used to find
 * clubs by name and to flag possible duplicate athletes for review. It never
 * merges records on its own.
 */

const ALEF_FORMS = /[أإآٱ]/g
const HARAKAT_AND_TATWEEL = /[ً-ٰٟـ]/g
const ZERO_WIDTH = /[​-‏‪-‮⁦-⁩﻿]/g
const ARABIC_INDIC_DIGITS = /[٠-٩]/g

export function normaliseArabic(text: string): string {
  return text
    .replace(ZERO_WIDTH, "")
    .replace(/^'/, "")
    .replace(HARAKAT_AND_TATWEEL, "")
    .replace(ALEF_FORMS, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(ARABIC_INDIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, " ")
    .trim()
}

/** Header labels in the legacy workbooks carry embedded newlines and stray spaces. */
export function normaliseHeader(text: unknown): string {
  return typeof text === "string" ? normaliseArabic(text).toLowerCase() : ""
}
