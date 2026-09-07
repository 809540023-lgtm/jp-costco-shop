import { describe, it, expect } from "vitest";
import { parseVisionResult, applySaleEvidenceRule, VisionResult } from "../lib/vision/vision-client";
import { scorePairing, pairCandidates, PairCandidate, PAIRING_MIN_SCORE } from "../lib/vision/pairing";
import { mergePairingToDeal, dealIdFor, buildObservationFromDeal, DealPhotoContext } from "../lib/vision/deals";

const daysAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString();

describe("Vision 輸出解析", () => {
  it("解析一般 JSON", () => {
    const r = parseVisionResult('{"product_name":"Happy Turn 仙貝","brand":"Kanro","costco_item_number":"123456","observed_price_jpy":599,"confidence":0.9}');
    expect(r?.product_name).toBe("Happy Turn 仙貝");
    expect(r?.observed_price_jpy).toBe(599);
  });
  it("解析 ```json 圍欄輸出", () => {
    const r = parseVisionResult('```json\n{"product_name":"大福","observed_price_jpy":699}\n```');
    expect(r?.product_name).toBe("大福");
  });
  it("非 JSON 回傳 null", () => {
    expect(parseVisionResult("抱歉我不知道")).toBeNull();
  });
  it("情境照保留 context_only", () => {
    const r = parseVisionResult('{"context_only":true}');
    expect(r?.context_only).toBe(true);
  });
});

describe("單一價格不是特價證據（交接規則）", () => {
  it("只有單一價格 → 清空特價欄位，只留 observed_price", () => {
    const r = applySaleEvidenceRule({
      context_only: false, product_name: "X", observed_price_jpy: 799,
      sale_price_jpy: 699, sale_evidence: "特價中", confidence: 0.9
    });
    expect(r.sale_evidence).toBeNull();
    expect(r.sale_price_jpy).toBeNull();
    expect(r.observed_price_jpy).toBe(799);
  });
  it("有「通常価格／OFF／値引」證據 → 特價欄位保留", () => {
    const r = applySaleEvidenceRule({
      context_only: false, product_name: "X",
      regular_price_jpy: 799, sale_price_jpy: 699,
      sale_evidence: "通常価格 799円 → 値引", confidence: 0.9
    });
    expect(r.sale_price_jpy).toBe(699);
    expect(r.regular_price_jpy).toBe(799);
  });
});

const pc = (over: Partial<PairCandidate>): PairCandidate => ({
  photoId: "p1", fileName: "S__1.jpg", capturedAt: null,
  productName: null, brand: null, costcoItemNumber: null, jan: null,
  packageQuantity: null, packageUnit: null, isPriceTag: false, observedPrice: null,
  ...over
});

describe("商品／價牌配對", () => {
  it("Item Number 相符 → 高分並產生配對建議", () => {
    const product = pc({ photoId: "p1", productName: "Happy Turn 仙貝 50週年", costcoItemNumber: "123456", capturedAt: daysAgo(5) });
    const tag = pc({ photoId: "t1", isPriceTag: true, costcoItemNumber: "123456", capturedAt: daysAgo(6) });
    const s = scorePairing(product, tag);
    expect(s.score).toBeGreaterThanOrEqual(PAIRING_MIN_SCORE);
    const proposals = pairCandidates([product], [tag]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].priceTagPhotoId).toBe("t1");
  });
  it("只靠檔名相鄰不應達門檻（不可只靠檔名連號配對）", () => {
    const product = pc({ photoId: "p1", fileName: "S__34611231.jpg", capturedAt: null, productName: "A商品" });
    const tag = pc({ photoId: "t1", fileName: "S__34611233.jpg", capturedAt: null, isPriceTag: true, observedPrice: 599 });
    expect(scorePairing(product, tag).score).toBeLessThan(PAIRING_MIN_SCORE);
  });
  it("無任何共同證據 → 不配對", () => {
    const product = pc({ photoId: "p1", productName: "納豆", capturedAt: daysAgo(100) });
    const tag = pc({ photoId: "t1", isPriceTag: true, observedPrice: 298, capturedAt: daysAgo(1) });
    expect(pairCandidates([product], [tag])).toHaveLength(0);
  });
  it("一對一：最佳分數優先，價牌照不重複使用", () => {
    const p1 = pc({ photoId: "p1", productName: "明治 Apollo 巧克力 90小包", costcoItemNumber: "111111" });
    const p2 = pc({ photoId: "p2", productName: "即沖洋蔥濃湯 18袋", costcoItemNumber: "222222" });
    const t1 = pc({ photoId: "t1", isPriceTag: true, costcoItemNumber: "111111" });
    const t2 = pc({ photoId: "t2", isPriceTag: true, costcoItemNumber: "222222" });
    const proposals = pairCandidates([p1, p2], [t1, t2]);
    expect(proposals).toHaveLength(2);
    const map = new Map(proposals.map((x) => [x.productPhotoId, x.priceTagPhotoId]));
    expect(map.get("p1")).toBe("t1");
    expect(map.get("p2")).toBe("t2");
  });
});

const dctx = (over: Partial<DealPhotoContext>): DealPhotoContext => ({
  photoId: "drive-abc", fileName: "S__1.jpg", capturedAt: "2026-09-01T10:00:00Z",
  storageRef: "costco-onsite-media/onsite/S__1.jpg", productId: null, candidate: null,
  ...over
});

describe("配對 → weekly_store_deals 特價草稿", () => {
  it("有促銷文字證據 → 保留特價欄位並計算折扣與單價", () => {
    const product = dctx({
      photoId: "drive-p1", fileName: "S__1.jpg",
      candidate: { product_name: "Happy Turn 仙貝", costco_item_number: "123456", package_quantity: 5, package_unit: "袋", confidence: 0.9 }
    });
    const tag = dctx({
      photoId: "drive-t1", fileName: "S__2.jpg", storageRef: "costco-onsite-media/onsite/S__2.jpg",
      candidate: {
        observed_price_jpy: 699, regular_price_jpy: 799, sale_price_jpy: 699,
        sale_evidence: "通常価格 799円 → 値引", sale_end_date: "2026-09-14", confidence: 0.8
      }
    });
    const deal = mergePairingToDeal(product, tag);
    expect(deal.id).toBe(dealIdFor("drive-p1"));
    expect(deal.status).toBe("draft");
    expect(deal.verification_status).toBe("UNVERIFIED");
    expect(deal.sale_price_jpy).toBe(699);
    expect(deal.regular_price_jpy).toBe(799);
    expect(deal.discount_jpy).toBe(100);
    expect(deal.unit_price).toBe(139.8);
    expect(deal.unit_price_label).toBe("約 ¥140/袋");
    expect(deal.sale_end_date).toBe("2026-09-14");
    expect(deal.product_name_ja).toBe("Happy Turn 仙貝");
    expect(deal.costco_item_number).toBe("123456");
    expect(deal.primary_photo_url).toBe("costco-onsite-media/onsite/S__1.jpg");
    expect(deal.price_tag_photo_url).toBe("costco-onsite-media/onsite/S__2.jpg");
    expect(deal.ai_confidence).toBe(0.8); // 兩者取較低值
  });
  it("單一價格無促銷文字 → 特價欄位清空，只記錄現場價格", () => {
    const product = dctx({ candidate: { product_name: "A商品" } });
    const tag = dctx({ candidate: { observed_price_jpy: 599 } });
    const deal = mergePairingToDeal(product, tag);
    expect(deal.sale_price_jpy).toBeNull();
    expect(deal.discount_jpy).toBeNull();
    expect(deal.sale_end_date).toBeNull();
    expect(deal.regular_price_jpy).toBe(599);
  });
  it("無價牌照 → 價格退回商品照候選，價牌網址為空", () => {
    const product = dctx({
      photoId: "drive-p2",
      candidate: { product_name: "大福", observed_price_jpy: 799, regular_price_jpy: 899, sale_price_jpy: 799, sale_evidence: "OFF" }
    });
    const deal = mergePairingToDeal(product, null);
    expect(deal.price_tag_photo_url).toBeNull();
    expect(deal.sale_price_jpy).toBe(799);
    expect(deal.regular_price_jpy).toBe(899);
    expect(deal.discount_jpy).toBe(100);
  });
  it("候選缺商品名 → 退回檔名（去副檔名）", () => {
    const product = dctx({ fileName: "IMG_3461.HEIC", candidate: null });
    const deal = mergePairingToDeal(product, null);
    expect(deal.product_name_ja).toBe("IMG_3461");
  });
});

describe("配對 → costco_price_observations 價格觀察", () => {
  it("以價牌照為鍵寫入觀察，帶入 deal 價格與折扣", () => {
    const product = dctx({ photoId: "drive-p1", candidate: { product_name: "A", jan: "49012345" } });
    const tag = dctx({
      photoId: "drive-t1", capturedAt: "2026-09-01T10:00:00Z",
      candidate: { observed_price_jpy: 699, regular_price_jpy: 799, sale_price_jpy: 699, sale_evidence: "値引" }
    });
    const deal = mergePairingToDeal(product, tag);
    const obs = buildObservationFromDeal(product, tag, deal);
    expect(obs).not.toBeNull();
    expect(obs!.id).toBe("obs-drive-t1");
    expect(obs!.photo_id).toBe("drive-t1");
    expect(obs!.deal_id).toBe(deal.id);
    expect(obs!.observed_price).toBe(699);
    expect(obs!.regular_price).toBe(799);
    expect(obs!.discount_amount).toBe(100);
    expect(obs!.verified).toBe(false);
  });
  it("無任何價格 → 不寫入觀察", () => {
    const product = dctx({ candidate: { product_name: "A" } });
    const tag = dctx({ candidate: { costco_item_number: "123456" } });
    const deal = mergePairingToDeal(product, tag);
    expect(buildObservationFromDeal(product, tag, deal)).toBeNull();
  });
  it("無價牌照 → 以商品照為鍵", () => {
    const product = dctx({ photoId: "drive-p2", candidate: { product_name: "A", observed_price_jpy: 799 } });
    const deal = mergePairingToDeal(product, null);
    const obs = buildObservationFromDeal(product, null, deal);
    expect(obs!.id).toBe("obs-drive-p2");
    expect(obs!.observed_price).toBe(799);
  });
});