import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids: string[] = rawIds.map((x: unknown) => String(x));
  if (!ids.length) return NextResponse.json({ error: "未選擇商品" }, { status: 400 });

  const date = new Date().toISOString().slice(0, 10);
  const collectionId = `${date}-costco-japan-top${ids.length}`;
  db.prepare("INSERT INTO published_collections (id, title) VALUES (?,?)").run(collectionId, `日本 Costco 精選 ${date}`);
  ids.forEach((id, i) => {
    db.prepare("UPDATE products SET status='published', updated_at=datetime('now') WHERE id=?").run(id);
    db.prepare("INSERT INTO published_collection_items (collection_id, product_id, rank) VALUES (?,?,?)").run(collectionId, id, i + 1);
  });
  audit("admin", "collection_published", "published_collection", collectionId, `count=${ids.length}`);
  return NextResponse.json({ ok: true, collectionId });
}
