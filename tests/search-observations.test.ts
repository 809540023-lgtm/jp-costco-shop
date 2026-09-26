import { describe, it, expect } from "vitest";
import { buildProductRow } from "@/lib/search";
import { buildObservationPayloads } from "@/lib/graph/observations";
import { EntityCandidate } from "@/lib/graph/entity-match";

// 官方 API 擷取到的完整商品
const fullProduct = {
  id: "jp-1730866",
  jpName: "サーモフラスク 真空断熱ステンレスボトル 0.71L 2本セット",
  englishName: "Thermoflask Stainless Bottle 24oz 2 Pack Set",
  costcoUrl: "https://www.costco.co.jp/c/Item/p/1730866",
  imageUrl: "https://www.costco.co.jp/medias/zoom.jpg",
  jpPrice: 1998,
  regularPrice: 3498,
  promoEvidence: "官方折扣 2026-09-10 ~ 2026-09-27",
  isHotBuy: true,
  madeInJapan: false,
  inStock: true,
  rating: 4.6,
  reviewCount: 339,
  summary: "• 保冷最大6時間",
  priceConfirmedAt: "2026-09-24T08:00:00.000Z",
  evidenceSource: "https://www.costco.co.jp/rest/v2/japan/products/search",
  evidenceType: "official_rest_api"
};

// HTML 備援只取得連結（無價格／評分／圖片）
const linkOnly = {
  id: "jp-85700",
  jpName: "Levis Womens Classic Straight Jeans",
  costcoUrl: "https://www.costco.co.jp/c/Item/p/85700",
  evidenceType: "official_page"
};

describe("search buildProductRow", () => {
  it("官方擷取欄位完整寫入", () => {
    const row = buildProductRow(fullProduct, 72, "sb-2026-09-24-080000");
    expect(row.jp_name).toBe(fullProduct.jpName);
    expect(row.english_name).toBe(fullProduct.englishName);
    expect(row.jp_price).toBe(1998);
    expect(row.discount_price).toBe(3498); // 有促銷證據才寫入官方原價
    expect(row.rating).toBe(4.6);
    expect(row.review_count).toBe(339);
    expect(row.image_url).toBe(fullProduct.imageUrl);
    expect(row.is_hot_buy).toBe(true);
    expect(row.in_stock).toBe(true);
    expect(row.price_confirmed_at).toBe(fullProduct.priceConfirmedAt);
    expect(row.summary).toContain("保冷");
    expect(row.status).toBe("pending_review");
    expect(row.score).toBe(72);
  });

  it("無促銷證據時不寫入 discount_price", () => {
    const row = buildProductRow({ ...fullProduct, promoEvidence: undefined, regularPrice: undefined }, 72, "b");
    expect(row.discount_price).toBeUndefined();
  });

  it("Made In Japan 標籤寫入 japan_exclusive_note", () => {
    const row = buildProductRow({ ...fullProduct, madeInJapan: true }, 72, "b");
    expect(row.japan_exclusive_note).toBe("官方標籤：Made In Japan");
  });

  it("keepStatus：已發布商品不被降級（不寫入 status 欄位）", () => {
    const row = buildProductRow(fullProduct, 72, "b", { keepStatus: true });
    // upsert 只更新 payload 內的欄位；省略 status 才不會把 published 蓋成 pending_review
    expect("status" in row).toBe(false);
    expect(row.jp_name).toBe(fullProduct.jpName);
    expect(row.score).toBe(72);
  });

  it("未指定 keepStatus 時仍為待審核（新商品一律先審）", () => {
    const row = buildProductRow(fullProduct, 72, "b");
    expect(row.status).toBe("pending_review");
  });

  it("HTML 備援商品不覆蓋既有價格／評分（缺值一律省略）", () => {
    const row = buildProductRow(linkOnly, 30, "b");
    expect(row.jp_price).toBeUndefined();
    expect(row.rating).toBeUndefined();
    expect(row.review_count).toBeUndefined();
    expect(row.image_url).toBeUndefined();
    expect(row.is_hot_buy).toBeUndefined();
    expect(row.english_name).toBeUndefined();
    expect(row.jp_name).toBe(linkOnly.jpName);
  });
});

describe("graph observations buildObservationPayloads", () => {
  const entities: EntityCandidate[] = [
    { id: "e-thermo", canonical_name: "Thermoflask Stainless Bottle 24oz 2 Pack Set", canonical_name_jp: "サーモフラスク 真空断熱ステンレスボトル 0.71L 2本セット" }
  ];

  it("命中實體時產生價格與評價觀測", () => {
    const out = buildObservationPayloads([fullProduct], entities, "2026-09-24");
    expect(out.matched).toBe(1);
    expect(out.priceRows).toHaveLength(1);
    expect(out.priceRows[0]).toMatchObject({
      product_id: "e-thermo", market: "costco_jp", price: 1998, currency: "JPY", is_promo: true, observed_at: "2026-09-24"
    });
    expect(out.reviewRows).toHaveLength(1);
    expect(out.reviewRows[0]).toMatchObject({ product_id: "e-thermo", market: "jp", avg_rating: 4.6, review_count: 339 });
  });

  it("找不到對應實體的商品一律跳過", () => {
    const out = buildObservationPayloads([{ id: "jp-1", jpName: "無關商品 XYZ 1000" }], entities, "2026-09-24");
    expect(out.matched).toBe(0);
    expect(out.skippedNoEntity).toBe(1);
    expect(out.priceRows).toHaveLength(0);
    expect(out.reviewRows).toHaveLength(0);
  });

  it("同日重複執行不重複寫入（冪等）", () => {
    const first = buildObservationPayloads([fullProduct], entities, "2026-09-24");
    expect(first.priceRows).toHaveLength(1);
    const second = buildObservationPayloads([fullProduct], entities, "2026-09-24", {
      price: new Set(["e-thermo"]),
      review: new Set(["e-thermo"])
    });
    expect(second.priceRows).toHaveLength(0);
    expect(second.reviewRows).toHaveLength(0);
  });
});
