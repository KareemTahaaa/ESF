"use client"

import { useFormState } from "react-dom"
import { FormError, SubmitButton, inputClass } from "@/components/workspace/form"
import { uploadImport, type ImportState } from "./actions"

export function UploadForm() {
  const [state, action] = useFormState<ImportState, FormData>(uploadImport, {})

  return (
    <form action={action} className="flex flex-col gap-4 rounded-md border border-ws-rule bg-ws-raised p-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ws-ink">نوع البيانات</legend>
        <label className="flex items-start gap-3 rounded-md border border-ws-rule p-3 has-[:checked]:border-ws-ink">
          <input type="radio" name="kind" value="athletes" defaultChecked className="mt-1" />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-ws-ink">سجل اللاعبين</span>
            <span className="text-sm text-ws-muted">
              ورقة «Database»: رقم اللاعب، الاسم، النادي، سنة الميلاد، النوع، وتصنيف وترتيب الموسم السابق.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-md border border-ws-rule p-3 has-[:checked]:border-ws-ink">
          <input type="radio" name="kind" value="historical_results" className="mt-1" />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-ws-ink">النتائج السابقة (الأزمنة)</span>
            <span className="text-sm text-ws-muted">
              ورقة «Records». تُحفظ للرجوع إليها فقط ولا تُحتسب منها نقاط، لأنها لا تتضمن المراكز.
            </span>
          </span>
        </label>
      </fieldset>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-ws-ink">
        ملف Excel
        <input
          type="file"
          name="file"
          required
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
          className={inputClass + " h-auto py-2 file:me-3 file:rounded file:border-0 file:bg-ws-sunk file:px-3 file:py-1"}
        />
        <span className="font-normal text-ws-muted">
          يُقرأ الملف فقط، ولا تُشغَّل أي وحدات ماكرو، ولا يُعدَّل الملف الأصلي.
        </span>
      </label>

      <FormError message={state.error} />
      <div className="sm:w-56">
        <SubmitButton pendingLabel="جارٍ قراءة الملف…">قراءة الملف ومعاينته</SubmitButton>
      </div>
    </form>
  )
}
