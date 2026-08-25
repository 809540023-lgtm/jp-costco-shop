import { NextResponse } from "next/server";
import { supabase, audit } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids: string[] = rawIds.map((x: unknown) => String(x));
  if (!ids.length) return NextResponse.json({ error: "未選擇商品" }, { status: 400 });

  const date = new Date().toISOString().slice(0, 10);
  const collectionId = `${date}-costco-japan-top${ids.length}`;
  await supabase.from("published_collections").insert({ id: collectionId, title: `日本 Costco 精選 ${date}` });
  for (let i = 0; i < ids.length; i++) {
    await supabase.from("products").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", ids[i]);
    await supabase.from("published_collection_items").insert({ collection_id: collectionId, product_id: ids[i], rank: i + 1 });
  }
  await audit("admin", "collection_published", "published_collection", collectionId, `count=${ids.length}`);
  return NextResponse.json({ ok: true, collectionId });
}
