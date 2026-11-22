import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip, type ChipTone } from "@/components/workspace/status-chip"
import { requireFederationAdmin } from "@/lib/auth/account"
import { getImportBatch } from "@/lib/workspace/competition"
import { formatCairo } from "@/lib/workspace/time"
import { BATCH_STATUS, KIND_LABEL } from "../labels"
import { ImportDecision } from "./decision"

export const metadata: Metadata = { title: "معاينة الاستيراد — الاتحاد المصري للتزلج" }

const ROW_STATUS: Record<string, { tone: ChipTone; label: string; help: string }> = {
  accepted: { tone: "ok", label: "مقبول", help: "يُستورد كما هو." },
  warning: { tone: "wait", label: "ملاحظة", help: "يُستورد، مع ملاحظة تحتاج متابعة." },
  needs_review: { tone: "wait", label: "يحتاج مراجعة", help: "يُستورد، لكن القيمة المشكوك فيها لا تُستخدم حتى تُصحَّح." },
  suspected_duplicate: { tone: "stop", label: "تكرار محتمل", help: "لا يُستورد حتى يقرر الاتحاد إن كان نفس اللاعب." },
  rejected: { tone: "stop", label: "مرفوض", help: "لا يُستورد. صحّح الملف وارفعه من جديد." },
}

const ORDER = ["rejected", "suspected_duplicate", "needs_review", "warning", "accepted"] as const

export default async function ImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ batch: string }>
  searchParams: Promise<{ status?: string }>
}) {
  await requireFederationAdmin()
  const { batch: id } = await params
  const { status: requested } = await searchParams
  const status = requested && requested in ROW_STATUS ? requested : null
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()

  const found = await getImportBatch(id, status)
  if (!found) notFound()
  const { batch, rows, total } = found
  const counts = batch.counts
  const importable = (counts.accepted ?? 0) + (counts.warning ?? 0) + (counts.needs_review ?? 0)
  const unmapped = (counts as unknown as { unmapped_columns?: string[] }).unmapped_columns ?? []

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/dashboard/federation/import" className="text-sm text-ws-muted hover:text-ws-ink">
          ← استيراد البيانات
        </Link>
        <h1 className="font-extrabold text-2xl text-ws-ink break-all">{batch.fileName}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ws-muted">
          <span>{KIND_LABEL[batch.kind]}</span>
          <span>رُفع {formatCairo(batch.createdAt)}</span>
          <StatusChip tone={BATCH_STATUS[batch.status].tone}>{BATCH_STATUS[batch.status].label}</StatusChip>
        </p>
        <p className="text-xs text-ws-muted">
          بصمة الملف <bdi dir="ltr" className="font-mono">SHA-256 {batch.sha256.slice(0, 16)}…</bdi>
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ws-rule bg-ws-rule sm:grid-cols-5">
        {ORDER.map((s) => (
          <Link
            key={s}
            href={`?status=${s}`}
            className={"flex flex-col gap-1 bg-ws-raised px-4 py-3 hover:bg-ws-sunk " + (status === s ? "ring-2 ring-inset ring-ws-ink" : "")}
          >
            <dt className="text-sm text-ws-muted">{ROW_STATUS[s]!.label}</dt>
            <dd className="text-2xl font-semibold text-ws-ink tabular">{(counts[s] ?? 0).toLocaleString("en-US")}</dd>
          </Link>
        ))}
      </dl>

      {unmapped.length > 0 ? (
        <p className="rounded-md border border-ws-wait/30 bg-ws-wait-wash px-4 py-3 text-sm text-ws-wait">
          أعمدة في الملف لم تُستخدم: {unmapped.join("، ")}
        </p>
      ) : null}

      {batch.status === "preview" ? (
        <section className="flex flex-col gap-3 rounded-md border border-ws-rule bg-ws-raised p-5">
          <h2 className="font-semibold text-ws-ink">القرار</h2>
          <ul className="flex flex-col gap-1 text-sm text-ws-soft">
            {ORDER.map((s) => (
              <li key={s}>
                <span className="font-medium">{ROW_STATUS[s]!.label}:</span> {ROW_STATUS[s]!.help}
              </li>
            ))}
          </ul>
          <p className="text-sm text-ws-soft">
            يتم الاستيراد كاملاً أو لا يتم إطلاقاً، ويُسجَّل باسمك في سجل التدقيق.
          </p>
          <ImportDecision batch={batch.id} importable={importable} />
        </section>
      ) : batch.result ? (
        <section className="rounded-md border border-ws-ok/30 bg-ws-ok-wash px-5 py-4 text-sm text-ws-ok">
          {batch.kind === "athletes"
            ? `أُضيف ${batch.result.inserted ?? 0} لاعباً، وحُدِّث ${batch.result.updated ?? 0}، ولم يتغير ${batch.result.unchanged ?? 0}. انتقالات أندية: ${batch.result.transfers ?? 0}. ترتيبات الموسم السابق: ${batch.result.rankings ?? 0}.`
            : `استُورد ${batch.result.results ?? 0} زمناً.`}
          {batch.committedAt ? ` (${formatCairo(batch.committedAt)})` : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ws-ink">
            {status ? `صفوف «${ROW_STATUS[status]!.label}»` : "الصفوف التي عليها ملاحظات"}
          </h2>
          <p className="text-sm text-ws-muted tabular">
            {rows.length < total ? `أول ${rows.length} من ${total}` : `${total} صف`}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-ws-rule px-6 py-8 text-center text-ws-muted">لا توجد صفوف هنا.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-ws-rule bg-ws-raised">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-ws-sunk text-ws-muted">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">الصف</th>
                  <th className="px-4 py-2.5 text-start font-medium">الحالة</th>
                  <th className="px-4 py-2.5 text-start font-medium">الرقم</th>
                  <th className="px-4 py-2.5 text-start font-medium">{batch.kind === "athletes" ? "الاسم" : "السباق والزمن"}</th>
                  <th className="px-4 py-2.5 text-start font-medium">الملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ws-rule">
                {rows.map((r) => (
                  <tr key={`${r.sheet}-${r.rowNumber}`} className="align-top">
                    <td className="px-4 py-3 text-ws-muted tabular">{r.rowNumber}</td>
                    <td className="px-4 py-3">
                      <StatusChip tone={ROW_STATUS[r.status]?.tone ?? "neutral"}>{ROW_STATUS[r.status]?.label ?? r.status}</StatusChip>
                    </td>
                    <td className="px-4 py-3 tabular text-ws-soft">{String(r.data.federation_number ?? "—")}</td>
                    <td className="px-4 py-3 text-ws-ink">
                      {batch.kind === "athletes" ? (
                        String(r.data.full_name_ar ?? "—")
                      ) : (
                        <bdi dir="ltr">
                          {String(r.data.race_code ?? "?")} · {String(r.data.time_raw ?? "")}
                        </bdi>
                      )}
                    </td>
                    <td className="px-4 py-3 leading-relaxed text-ws-soft">
                      {r.issues.length === 0 ? "—" : (
                        <ul className="flex flex-col gap-1">
                          {r.issues.map((i, n) => (
                            <li key={n}>{i.message}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
