// 發布核心邏輯：2.0 publish API（app/api/admin/products/publish）與
// 3.0 Agent 5 草稿／排程發布共用同一條路徑（沿用既有行為，不另建流程）。
import { supabase, audit } from "@/lib/supabase";

export function collectionIdFor(date: string, count: number): string {
  return `${date}-costco-japan-top${count}`;
}

export interface ScheduleLike {
  publish_status: string;
  scheduled_for: string | null;
}

// 排程到期判斷（純函式，可測試）：已核准且排程時間已到
export function isDraftDue(draft: ScheduleLike, now: Date): boolean {
  return draft.publish_status === "approved" && !!draft.scheduled_for && new Date(draft.scheduled_for) <= now;
}

// 排程時間驗證（純函式）：需可解析且晚於現在（允許 1 分鐘誤差），回傳 ISO 或 null
export function validateScheduledFor(value: unknown, now: Date): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t) || t < now.getTime() - 60 * 1000) return null;
  return new Date(t).toISOString();
}

export interface PublishResult {
  collectionId: string;
  publishedIds: string[];
}

// 沿用 2.0 既有 publish 行為：建立本期 collection、商品狀態改 published、寫入 items、稽核
export async function publishCollection(ids: string[], now?: Date): Promise<PublishResult> {
  const date = (now ?? new Date()).toISOString().slice(0, 10);
  const collectionId = collectionIdFor(date, ids.length);
  await supabase.from("published_collections").insert({ id: collectionId, title: `日本 Costco 精選 ${date}` });
  for (let i = 0; i < ids.length; i++) {
    await supabase.from("products").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", ids[i]);
    await supabase.from("published_collection_items").insert({ collection_id: collectionId, product_id: ids[i], rank: i + 1 });
  }
  await audit("admin", "collection_published", "published_collection", collectionId, `count=${ids.length}`);
  return { collectionId, publishedIds: ids };
}

export interface PublishDraftResult {
  collectionId: string;
  productId: string;
}

// Agent 5 草稿發布：由 content_draft 建立 2.0 商品（人工核准後才進商業端），
// 再走共用 publishCollection。排程發布（cron）與立即發布（API）都呼叫此函式。
export async function publishDraftNow(draftId: string, now?: Date): Promise<PublishDraftResult> {
  const { data: draft } = await supabase.from("content_draft").select("*").eq("id", draftId).maybeSingle();
  if (!draft) throw new Error("草稿不存在");
  if (draft.publish_status === "published") throw new Error("草稿已發布");
  const { data: entity } = await supabase.from("product_entity")
    .select("canonical_name, canonical_name_jp, brand, category")
    .eq("id", draft.product_id).maybeSingle();

  let productId = (draft.published_product_id as string | null) || null;
  if (!productId) {
    // 最新觀測價與決策分數，補齊 2.0 商品欄位
    const [jp, snap] = await Promise.all([
      supabase.from("price_observation").select("price").eq("product_id", draft.product_id)
        .eq("market", "costco_jp").order("observed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("score_snapshot").select("recommendation_score").eq("product_id", draft.product_id)
        .order("snapshot_date", { ascending: false }).limit(1).maybeSingle()
    ]);
    productId = crypto.randomUUID();
    const { error } = await supabase.from("products").insert({
      id: productId,
      jp_name: entity?.canonical_name_jp || entity?.canonical_name || draft.title_tw,
      zh_name: draft.title_tw,
      brand: entity?.brand || null,
      category: entity?.category || null,
      spec: draft.spec_text,
      description: draft.description_tw,
      features: Array.isArray(draft.selling_points) ? draft.selling_points.join("\n") : null,
      jp_price: jp?.data ? Number((jp.data as { price: unknown }).price) : null,
      taiwan_suggested_price: draft.suggested_price_twd,
      evidence_source: "product_intelligence_graph",
      evidence_type: "agent5_content_draft",
      status: "approved",
      score: snap?.data ? Number((snap.data as { recommendation_score: unknown }).recommendation_score) : 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) throw new Error(`建立商品失敗：${error.message}`);
  }

  const { collectionId } = await publishCollection([productId], now);
  await supabase.from("content_draft").update({
    publish_status: "published",
    published_product_id: productId,
    approved_at: new Date().toISOString()
  }).eq("id", draftId);
  await audit("agent5", "draft_published", "content_draft", draftId, `product=${productId},collection=${collectionId}`);
  return { collectionId, productId };
}