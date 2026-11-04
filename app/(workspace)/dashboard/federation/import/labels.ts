export const KIND_LABEL = { athletes: "سجل اللاعبين", historical_results: "النتائج السابقة" } as const

export const BATCH_STATUS = {
  preview: { tone: "wait", label: "معاينة — لم يُستورد" },
  committed: { tone: "ok", label: "تم الاستيراد" },
  discarded: { tone: "neutral", label: "تم تجاهله" },
} as const
