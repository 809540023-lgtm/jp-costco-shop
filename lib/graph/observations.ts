// 官方 Costco JP 擷取結果 → 3.0 Graph 觀測（price_observation / review_snapshot）。
// 依 AGENTS 規則：只寫 Graph 既有表，不動 2.0 表；觀測資料可追溯（observed_at + source_url）。
// 找不到對應 product_entity 的商品一律跳過（實體建立屬 Agent 1／Astra 的職責）。
import { supabase } from "@/lib/supabase";
import type { RawProduct } from "@/lib/search";
import { EntityCandidate, matchEntityId } from "./entity-match";

export interface ObservationSyncResult {
  considered: number;
  matched: number;
  priceObservations: number;
  reviewSnapshots: number;
  skippedNoEntity: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loadEntityCandidates(limit = 2000): Promise<EntityCandidate[]> {
  const { data, error } = await supabase
    .from("product_entity")
    .select("id, canonical_name, canonical_name_jp, brand, keywords")
    .order("last_activity_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`商品實體讀取失敗：${error.message}`);
  return (data || []) as EntityCandidate[];
}

async function existingKeys(table: string, market: string, productIds: string[], observedAt: string): Promise<Set<string>> {
  if (!productIds.length) return new Set();
  const { data } = await supabase
    .from(table)
    .select("product_id")
    .eq("market", market)
    .eq("observed_at", observedAt)
    .in("product_id", productIds);
  return new Set((data || []).map((r) => (r as { product_id: string }).product_id));
}

// 依「已有觀測」與比對結果產生要寫入的列（純函式，便於測試；不含任何 I/O）。
export function buildObservationPayloads(
  products: RawProduct[],
  entities: EntityCandidate[],
  observedAt: string,
  existing?: { price?: Set<string>; review?: Set<string> }
): { matched: number; skippedNoEntity: number; priceRows: Record<string, unknown>[]; reviewRows: Record<string, unknown>[] } {
  const price = existing?.price ?? new Set<string>();
  const review = existing?.review ?? new Set<string>();
  const matchedProducts = products
    .map((p) => ({ product: p, entityId: matchEntityId(p, entities) }))
    .filter((row): row is { product: RawProduct; entityId: string } => Boolean(row.entityId));

  const priceRows: Record<string, unknown>[] = [];
  const reviewRows: Record<string, unknown>[] = [];
  for (const { product, entityId } of matchedProducts) {
    if (product.jpPrice != null && !price.has(entityId)) {
      priceRows.push({
        product_id: entityId,
        market: "costco_jp",
        price: product.jpPrice,
        currency: "JPY",
        is_promo: Boolean(product.promoEvidence),
        observed_at: observedAt,
        source_url: product.costcoUrl ?? null
      });
    }
    if ((product.rating != null || product.reviewCount != null) && !review.has(entityId)) {
      reviewRows.push({
        product_id: entityId,
        market: "jp",
        avg_rating: product.rating ?? null,
        review_count: product.reviewCount ?? null,
        notable_quotes: [],
        observed_at: observedAt
      });
    }
  }
  return {
    matched: matchedProducts.length,
    skippedNoEntity: products.length - matchedProducts.length,
    priceRows,
    reviewRows
  };
}

// 每日 cron 可重複執行：同一實體、同一 market、同一天不重複寫入。
export async function syncCostcoJpObservations(
  products: RawProduct[],
  options?: { entities?: EntityCandidate[]; observedAt?: string }
): Promise<ObservationSyncResult> {
  const observedAt = options?.observedAt ?? today();
  const entities = options?.entities ?? (await loadEntityCandidates());
  const result: ObservationSyncResult = {
    considered: products.length, matched: 0, priceObservations: 0, reviewSnapshots: 0, skippedNoEntity: 0
  };
  // 沒有任何實體時，全部商品都是「找不到對應實體」；若這裡直接回 0，
  // 操作端會誤以為 300 筆都對上了（實際上 0 筆有觀測）。
  if (!entities.length) {
    result.skippedNoEntity = products.length;
    return result;
  }

  const prelim = buildObservationPayloads(products, entities, observedAt);
  result.matched = prelim.matched;
  result.skippedNoEntity = prelim.skippedNoEntity;
  if (!prelim.matched) return result;

  const entityIds = [...new Set(prelim.priceRows.concat(prelim.reviewRows).map((r) => String(r.product_id)))];
  const [existingPrice, existingReview] = await Promise.all([
    existingKeys("price_observation", "costco_jp", entityIds, observedAt),
    existingKeys("review_snapshot", "jp", entityIds, observedAt)
  ]);
  const { priceRows, reviewRows } = buildObservationPayloads(products, entities, observedAt, {
    price: existingPrice,
    review: existingReview
  });

  if (priceRows.length) {
    const { error } = await supabase.from("price_observation").insert(priceRows);
    if (error) throw new Error(`價格觀測寫入失敗：${error.message}`);
    result.priceObservations = priceRows.length;
  }
  if (reviewRows.length) {
    const { error } = await supabase.from("review_snapshot").insert(reviewRows);
    if (error) throw new Error(`評價觀測寫入失敗：${error.message}`);
    result.reviewSnapshots = reviewRows.length;
  }
  return result;
}
