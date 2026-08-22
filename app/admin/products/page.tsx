import { db, audit } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminProducts() {
  const pending = db.prepare("SELECT * FROM products WHERE status='pending_review' ORDER BY score DESC").all() as any[];
  const published = db.prepare("SELECT * FROM products WHERE status='published' ORDER BY score DESC").all() as any[];

  async function approve(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    db.prepare("UPDATE products SET status='approved', updated_at=datetime('now') WHERE id=?").run(id);
    audit("admin", "product_approved", "product", id);
    redirect("/admin/products");
  }

  async function publish(formData: FormData) {
    "use server";
    const ids = formData.getAll("ids") as string[];
    if (!ids.length) return;
    const date = new Date().toISOString().slice(0, 10);
    const collectionId = `${date}-costco-japan-top${ids.length}`;
    db.prepare("INSERT INTO published_collections (id, title) VALUES (?,?)").run(collectionId, `日本 Costco 精選 ${date}`);
    ids.forEach((id, i) => {
      db.prepare("UPDATE products SET status='published', updated_at=datetime('now') WHERE id=?").run(id);
      db.prepare("INSERT INTO published_collection_items (collection_id, product_id, rank) VALUES (?,?,?)").run(collectionId, id, i + 1);
    });
    audit("admin", "collection_published", "published_collection", collectionId, `count=${ids.length}`);
    redirect("/admin/products");
  }

  return (
    <div>
      <a href="/admin" className="text-sm text-gray-500">← 後台</a>
      <h1 className="mt-2 text-2xl font-extrabold">商品審核與發布</h1>

      <h2 className="mt-6 text-lg font-extrabold">待審核（{pending.length}）</h2>
      <div className="mt-2 space-y-2">
        {pending.length === 0 ? <p className="text-gray-500">沒有待審核商品。</p> : null}
        {pending.map((p) => (
          <form key={p.id} action={approve} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3">
            <div className="flex-1">
              <div className="font-bold">{p.zh_name || p.jp_name}</div>
              <div className="text-xs text-gray-500">{p.jp_name} · 分數 {p.score}</div>
            </div>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn btn-primary">核准</button>
          </form>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-extrabold">發布本期商品</h2>
      <form action={publish} className="mt-2 space-y-2">
        {published.length === 0 ? <p className="text-gray-500">尚無已發布商品。</p> : null}
        {published.map((p) => (
          <label key={p.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3">
            <input type="checkbox" name="ids" value={p.id} defaultChecked />
            <div className="flex-1">
              <div className="font-bold">{p.zh_name || p.jp_name}</div>
              <div className="text-xs text-gray-500">分數 {p.score}</div>
            </div>
          </label>
        ))}
        <button className="btn btn-primary w-full">發布本期商品</button>
      </form>
    </div>
  );
}
