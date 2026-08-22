import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import ApproveButton from "@/components/admin/ApproveButton";
import PublishForm from "@/components/admin/PublishForm";

export const dynamic = "force-dynamic";

export default async function AdminProducts() {
  await requireAdmin();
  const pending = db.prepare("SELECT * FROM products WHERE status='pending_review' ORDER BY score DESC").all() as any[];
  const published = db.prepare("SELECT * FROM products WHERE status='published' ORDER BY score DESC").all() as any[];

  return (
    <div>
      <a href="/admin" className="text-sm text-gray-500">← 後台</a>
      <h1 className="mt-2 text-2xl font-extrabold">商品審核與發布</h1>

      <h2 className="mt-6 text-lg font-extrabold">待審核（{pending.length}）</h2>
      <div className="mt-2 space-y-2">
        {pending.length === 0 ? <p className="text-gray-500">沒有待審核商品。</p> : null}
        {pending.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3">
            <div className="flex-1">
              <div className="font-bold">{p.zh_name || p.jp_name}</div>
              <div className="text-xs text-gray-500">{p.jp_name} · 分數 {p.score}</div>
            </div>
            <ApproveButton id={p.id} />
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-extrabold">發布本期商品</h2>
      <PublishForm items={published.map((p) => ({ id: p.id, zh_name: p.zh_name, jp_name: p.jp_name, score: p.score }))} />
    </div>
  );
}
