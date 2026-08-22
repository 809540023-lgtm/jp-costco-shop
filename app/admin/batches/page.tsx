import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminBatches() {
  await requireAdmin();
  const batches = db.prepare("SELECT * FROM search_batches ORDER BY search_date DESC LIMIT 30").all() as any[];
  return (
    <div>
      <a href="/admin" className="text-sm text-gray-500">← 後台</a>
      <h1 className="mt-2 text-2xl font-extrabold">搜尋批次</h1>
      <div className="mt-4 space-y-3">
        {batches.length === 0 ? <p className="text-gray-500">尚無搜尋批次。</p> : null}
        {batches.map((b) => (
          <div key={b.id} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex justify-between font-bold">
              <span>{b.id}</span><span className="text-sm text-gray-500">{b.status}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">{b.summary || `保留 ${b.product_count} 項`}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
