import { describe, it, expect } from "vitest";
import { parseVisionResult, applySaleEvidenceRule, VisionResult } from "../lib/vision/vision-client";
import { scorePairing, pairCandidates, PairCandidate, PAIRING_MIN_SCORE } from "../lib/vision/pairing";

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