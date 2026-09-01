import { requireAdmin } from "@/lib/auth";
import { getPhotoQueueSummary } from "@/lib/onsite-deals";

export const dynamic = "force-dynamic";

export default async function OnsiteAdminPage() {
  await requireAdmin();
  const summary = getPhotoQueueSummary();

  return (
    <div>
      <h1 className="text-2xl font-extrabold">📷 Costco 現場商品</h1>
      <p className="mt-1 text-sm text-gray-500">Drive 同步、照片處理、商品與價牌配對的管理入口。</p>
      <div className="mt-4 rounded-2xl border bg-white p-5">
        <div className="text-sm text-gray-500">Queue 檔案總數</div>
        <div className="text-3xl font-extrabold">{summary.total}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.groups.map((group) => <span key={group.status} className="rounded-full bg-gray-100 px-3 py-1 text-sm">{group.status}: {group.n}</span>)}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {['Google Drive Sync', 'Batch Import', 'Processing Queue', 'Vision Results', 'Product Matching', 'Price Matching', 'Needs Review', 'Confirmed / Published', 'Failed'].map((label) => (
          <div key={label} className="rounded-xl border bg-white p-4 font-semibold">{label}</div>
        ))}
      </div>
    </div>
  );
}
