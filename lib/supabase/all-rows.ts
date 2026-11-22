/**
 * Supabase's API returns at most 1,000 rows per request by default. The
 * athlete registry (777 today) and result imports grow past that, so lists
 * that must be complete are read in pages.
 */

const PAGE_SIZE = 1000

export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}
