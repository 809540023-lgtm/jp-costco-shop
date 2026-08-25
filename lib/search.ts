// 日本 Costco 商品搜尋模組。
// 依規格書：每天搜尋、保留歷史、分類證據來源、不把「官方頁面出現」寫成「實際銷量第一」。
// 注意：日本 Costco 未公開全國實際銷量排行榜，排名為依官方熱門訊號、評論數、Hot Buy、新品與日本市場討論度推估。

import { supabase, audit } from "./supabase";
import { scoreProduct, shouldExclude, RankingInput } from "./ranking";

export const DISCLAIMER =
  "日本 Costco 未公開全國實際銷量前 50 名，本排名為依官方熱門訊號、評論數、Hot Buy、新品及日本市場討論度推估。";

export interface RawProduct {
  id: string;
  jpName: string;
  brand?: string;
  category?: string;
  spec?: string;
  janCode?: string;
  costcoUrl?: string;
  imageUrl?: string;
  jpPrice?: number;
  isHotBuy?: boolean;
  isNew?: boolean;
  rating?: number;
  reviewCount?: number;
  evidenceSource?: string;
  evidenceType?: string;
}

// 依規格保留條件評估日本特色程度。
function estimate(raw: RawProduct): RankingInput & {
  isGlobalCommon: boolean;
  bulky: boolean;
  heavy: boolean;
  perishable: boolean;
  highRegulation: boolean;
  easilyAvailableInTaiwan: boolean;
} {
  const text = `${raw.jpName} ${raw.category ?? ""} ${raw.spec ?? ""}`.toLowerCase();
  const isGlobalCommon = /kirkland/.test(text) && /衛生紙|紙巾|礦泉|水$|tissue|paper towel|water/.test(text);
  const bulky = /冰箱|電視|洗衣機|床墊|sofa|tv|refrigerator|fridge|washing machine|mattress|chair|furniture|stand|desk|table|grill|bike|bicycle/.test(text);
  const heavy = /米|米袋|飲料箱|rice|water|drink|beverage|kg|リットル/.test(text) && /kg|公斤|リットル|24|30|40/.test(text);
  const perishable = /肉|魚|生鮮|冷藏|冷凍|乳|卵|meat|fish|fresh|frozen|dairy|egg|milk|beef|pork|chicken|seafood/.test(text);
  const highRegulation = /薬|医療|酒|化粧|健康食品|medicine|drug|alcohol|beer|wine|cosmetic|supplement|sun|sunscreen|spf|vitamin|pharma/.test(text);
  const easilyAvailableInTaiwan = /iphone|ipad|switch|sony|panasonic|dyson|samsung|lg|apple|nintendo/.test(text);
  return {
    isHotBuy: raw.isHotBuy ?? false,
    isNew: raw.isNew ?? false,
    reviewCount: raw.reviewCount ?? 0,
    rating: raw.rating ?? null,
    japanExclusive: text.includes("日本") ? 0.9 : 0.4,
    taiwanDemand: 0.5,
    logisticsFit: 0.6,
    regulationRisk: highRegulation ? 0.9 : 0.2,
    profitSpeed: 0.6,
    marketBuzz: raw.reviewCount ? Math.min(1, raw.reviewCount / 300) : 0.3,
    isGlobalCommon,
    bulky,
    heavy,
    perishable,
    highRegulation,
    easilyAvailableInTaiwan
  };
}

// 建立每日搜尋批次並寫入待審核商品。
export async function runDailySearch(rawProducts: RawProduct[]): Promise<{ batchId: string; count: number }> {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const batchId = `sb-${date}-${now.toISOString().slice(11, 19).replace(/:/g, "")}`;
  await supabase.from("search_batches").insert({ id: batchId, search_date: date, status: "running", product_count: rawProducts.length });

  let kept = 0;
  for (const raw of rawProducts) {
    const input = estimate(raw);
    if (shouldExclude(input)) continue;
    const breakdown = scoreProduct(input);
    if (breakdown.total < 20) continue; // 過低分數不列入
    await supabase.from("products").upsert({
      id: raw.id, jp_name: raw.jpName, brand: raw.brand ?? null, category: raw.category ?? null,
      spec: raw.spec ?? null, jan_code: raw.janCode ?? null, costco_url: raw.costcoUrl ?? null,
      image_url: raw.imageUrl ?? null, jp_price: raw.jpPrice ?? null,
      is_hot_buy: raw.isHotBuy ?? false, is_new: raw.isNew ?? false, rating: raw.rating ?? null,
      review_count: raw.reviewCount ?? 0, evidence_source: raw.evidenceSource ?? null,
      evidence_type: raw.evidenceType ?? null, status: "pending_review", score: breakdown.total,
      search_batch_id: batchId, updated_at: new Date().toISOString()
    }, { onConflict: "id" });
    await supabase.from("product_rankings").insert({
      product_id: raw.id, search_batch_id: batchId, score: breakdown.total, score_breakdown: JSON.stringify(breakdown)
    });
    kept += 1;
  }

  await supabase.from("search_batches").update({ status: "completed", summary: `保留 ${kept} 項日本特色商品。${DISCLAIMER}`, product_count: kept }).eq("id", batchId);
  await audit("search-job", "search_batch_completed", "search_batch", batchId, `kept=${kept}`);
  return { batchId, count: kept };
}

// 從已發布集合讀取當前網站商品
export async function getPublishedProducts(collectionId?: string): Promise<any[]> {
  if (collectionId) {
    const { data } = await supabase
      .from("published_collection_items")
      .select("rank, products(*)")
      .eq("collection_id", collectionId)
      .order("rank", { ascending: true });
    return (data || []).map((r: any) => r.products);
  }
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("status", "published")
    .order("score", { ascending: false })
    .order("updated_at", { ascending: false });
  return data || [];
}
