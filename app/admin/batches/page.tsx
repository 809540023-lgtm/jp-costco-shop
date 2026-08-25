import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminBatches() {
  await requireAdmin();
  const { data: batches } = await supabase.from("search_batches").select("*").order("search_date", { ascending: false }).limit(30);

  return (
    <div>
      <a href="/admin" className="text-sm text-gray-500">← 後台</a>
      <h1 className="mt-2 text-2xl font-extrabold">搜尋批次</h1>
      <div className="mt-4 space-y-3">
        {!batches || batches.length === 0 ? <p className="text-gray-500">尚無搜尋批次。</p> : null}
        {(batches || []).map((b) => (
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
