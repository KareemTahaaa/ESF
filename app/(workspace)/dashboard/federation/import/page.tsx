import type { Metadata } from "next"
import Link from "next/link"
import { StatusChip } from "@/components/workspace/status-chip"
import { requireFederationAdmin } from "@/lib/auth/account"
import { listImportBatches } from "@/lib/workspace/competition"
import { formatCairo } from "@/lib/workspace/time"
import { BATCH_STATUS, KIND_LABEL } from "./labels"
import { UploadForm } from "./upload-form"

export const metadata: Metadata = { title: "استيراد البيانات — الاتحاد المصري للتزلج" }

export default async function ImportPage() {
  const admin = await requireFederationAdmin()
  const batches = admin.isDemo ? [] : await listImportBatches()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-extrabold text-3xl text-ws-ink">استيراد البيانات</h1>
        <p className="max-w-2xl leading-relaxed text-ws-muted">
          ارفع ملف Excel لتراه أولاً في معاينة: كل صف مقبول أو عليه ملاحظة أو مرفوض، مع السبب. لا يدخل شيء إلى سجل الاتحاد
          إلا بعد أن تراجع المعاينة وتؤكد الاستيراد. الملف نفسه لا يمكن استيراده مرتين، ويُطابَق اللاعب برقمه في الاتحاد
          فقط، فلا يُدمج لاعبان لمجرد تشابه الاسم.
        </p>
      </header>

      <UploadForm />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ws-ink">الملفات السابقة</h2>
        {batches.length === 0 ? (
          <p className="rounded-md border border-dashed border-ws-rule px-6 py-8 text-center text-ws-muted">لم يُرفع أي ملف بعد.</p>
        ) : (
          <ul className="divide-y divide-ws-rule rounded-md border border-ws-rule bg-ws-raised">
            {batches.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/dashboard/federation/import/${b.id}`}
                  className="flex flex-col gap-1 px-5 py-3 hover:bg-ws-sunk sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ws-ink">{b.fileName}</span>
                    <span className="text-sm text-ws-muted">
                      {KIND_LABEL[b.kind]} · {formatCairo(b.createdAt)}
                    </span>
                  </span>
                  <StatusChip tone={BATCH_STATUS[b.status].tone}>{BATCH_STATUS[b.status].label}</StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
