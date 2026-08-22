// 日本 Costco 商品搜尋模組。
// 依規格書：每天搜尋、保留歷史、分類證據來源、不把「官方頁面出現」寫成「實際銷量第一」。
// 注意：日本 Costco 未公開全國實際銷量排行榜，排名為依官方熱門訊號、評論數、Hot Buy、新品與日本市場討論度推估。

import { db, audit } from "./db";
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
  const isGlobalCommon = /kirkland/.test(text) && /衛生紙|紙巾|礦泉|水$/.test(text);
  const bulky = /冰箱|電視|洗衣機|床墊|sofa/.test(text);
  const heavy = /米|米袋|飲料箱/.test(text) && /kg|公斤/.test(text);
  const perishable = /肉|魚|生鮮|冷藏|冷凍|乳|卵/.test(text);
  const highRegulation = /薬|医療|酒|化粧|健康食品/.test(text);
  const easilyAvailableInTaiwan = /iphone|ipad|switch|sony|panasonic|dyson/.test(text);
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
export function runDailySearch(rawProducts: RawProduct[]): { batchId: string; count: number } {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const batchId = `sb-${date}-${now.toISOString().slice(11, 19).replace(/:/g, "")}`;
  db.prepare("INSERT INTO search_batches (id, search_date, status, product_count) VALUES (?, ?, 'running', ?)").run(
    batchId,
    date,
    rawProducts.length
  );

  let kept = 0;
  for (const raw of rawProducts) {
    const input = estimate(raw);
    if (shouldExclude(input)) continue;
    const breakdown = scoreProduct(input);
    if (breakdown.total < 20) continue; // 過低分數不列入
    db.prepare(
      `INSERT INTO products (id, jp_name, brand, category, spec, jan_code, costco_url, image_url, jp_price,
        is_hot_buy, is_new, rating, review_count, evidence_source, evidence_type, status, score, search_batch_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_review',?,?)`
    ).run(
      raw.id, raw.jpName, raw.brand ?? null, raw.category ?? null, raw.spec ?? null, raw.janCode ?? null,
      raw.costcoUrl ?? null, raw.imageUrl ?? null, raw.jpPrice ?? null,
      raw.isHotBuy ? 1 : 0, raw.isNew ? 1 : 0, raw.rating ?? null, raw.reviewCount ?? 0,
      raw.evidenceSource ?? null, raw.evidenceType ?? null, breakdown.total, batchId
    );
    db.prepare("INSERT INTO product_rankings (product_id, search_batch_id, score, score_breakdown) VALUES (?,?,?,?)")
      .run(raw.id, batchId, breakdown.total, JSON.stringify(breakdown));
    kept += 1;
  }

  db.prepare("UPDATE search_batches SET status='completed', summary=?, product_count=? WHERE id=?").run(
    `保留 ${kept} 項日本特色商品。${DISCLAIMER}`, kept, batchId
  );
  audit("search-job", "search_batch_completed", "search_batch", batchId, `kept=${kept}`);
  return { batchId, count: kept };
}

// 從已發布集合讀取當前網站商品
export function getPublishedProducts(collectionId?: string) {
  if (collectionId) {
    return db.prepare(
      `SELECT p.* FROM products p
       JOIN published_collection_items i ON i.product_id = p.id
       JOIN published_collections c ON c.id = i.collection_id
       WHERE c.id = ? ORDER BY i.rank ASC`
    ).all(collectionId) as any[];
  }
  return db.prepare("SELECT * FROM products WHERE status='published' ORDER BY score DESC LIMIT 50").all() as any[];
}
