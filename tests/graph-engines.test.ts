import { describe, it, expect } from "vitest";
import { computeSuitability } from "../lib/graph/suitability";
import { mapDecision, ruleDecision, decideWithOptionalAstra } from "../lib/graph/decision";
import { buildListingDraft } from "../lib/graph/listing-draft";

const goodInput = {
  intentScore: 80,
  japanExclusive: 0.9,
  priceGapPct: 0.45,
  resellerCompetition: 0.2,
  weightG: 600,
  volumeCm3: 4000,
  shelfLifeDays: 365,
  fragile: false,
  needsColdChain: false,
  twImportOk: true,
  estimatedMarginTwd: 250,
  hasQualityImage: true,
  repeatPurchaseRate: 0.5,
  avgRating: 4.6,
  resellerSignalScore: 70
};

describe("Agent 3 適合度", () => {
  it("法規不過 → 硬性淘汰（score 0）", () => {
    const r = computeSuitability({ ...goodInput, twImportOk: false });
    expect(r.hardFail).toBe(true);
    expect(r.score).toBe(0);
  });
  it("條件良好 → 高分", () => {
    const r = computeSuitability(goodInput);
    expect(r.score).toBeGreaterThanOrEqual(65);
    expect(r.factors.length).toBeGreaterThan(10);
  });
  it("重物、短效期、冷鏈、無價差、低需求 → 低於 40 淘汰門檻", () => {
    const r = computeSuitability({
      ...goodInput,
      intentScore: 10,
      priceGapPct: -0.1,
      weightG: 15000,
      shelfLifeDays: 20,
      needsColdChain: true,
      estimatedMarginTwd: 0,
      repeatPurchaseRate: 0,
      resellerSignalScore: 5
    });
    expect(r.score).toBeLessThan(40);
  });
});

describe("Agent 4 決策映射", () => {
  it("90 → weekly_pick、75 → list、60 → observe、40 → reject", () => {
    expect(mapDecision(90)).toBe("weekly_pick");
    expect(mapDecision(75)).toBe("list");
    expect(mapDecision(60)).toBe("observe");
    expect(mapDecision(40)).toBe("reject");
  });
  it("硬性淘汰 → reject 且不呼叫 Astra", async () => {
    let astraCalled = false;
    const r = await decideWithOptionalAstra(
      { id: "e1", canonicalName: "X", canonicalNameJp: null, brand: null },
      { resellerSignalScore: 90, intentScore: 95, suitabilityScore: 90, hardFail: true, factors: [] },
      async () => { astraCalled = true; return null; }
    );
    expect(r.decision).toBe("reject");
    expect(astraCalled).toBe(false);
    expect(r.modelUsed).toBe("rules");
  });
  it("未達 Astra 門檻 → 使用規則 fallback", async () => {
    let astraCalled = false;
    const r = await decideWithOptionalAstra(
      { id: "e1", canonicalName: "X", canonicalNameJp: null, brand: null },
      { resellerSignalScore: 10, intentScore: 10, suitabilityScore: 30, hardFail: false, factors: [] },
      async () => { astraCalled = true; return null; }
    );
    expect(astraCalled).toBe(false);
    expect(r.modelUsed).toBe("rules");
  });
  it("通過門檻且 Astra 回傳 → 採用 Astra 決策", async () => {
    const r = await decideWithOptionalAstra(
      { id: "e1", canonicalName: "X", canonicalNameJp: null, brand: null },
      { resellerSignalScore: 90, intentScore: 80, suitabilityScore: 80, hardFail: false, factors: [] },
      async () => ({ recommendationScore: 91, decision: "weekly_pick" as const, reasons: [], comment: "建議本週主推" })
    );
    expect(r.modelUsed).toBe("astra");
    expect(r.decision).toBe("weekly_pick");
  });
  it("Astra 失敗 → 降級規則決策（不阻塞）", async () => {
    const r = await decideWithOptionalAstra(
      { id: "e1", canonicalName: "X", canonicalNameJp: null, brand: null },
      { resellerSignalScore: 90, intentScore: 80, suitabilityScore: 80, hardFail: false, factors: [] },
      async () => { throw new Error("astra down"); }
    );
    expect(r.modelUsed).toBe("rules");
    expect(r.recommendationScore).toBeGreaterThan(0);
  });
});

describe("Agent 5 自動上架草稿", () => {
  it("產生繁中標題、說明、SEO 與單價", () => {
    const draft = buildListingDraft({
      canonicalNameJp: "テスト商品",
      canonicalName: "奇奇蒂蒂聯名夾心餅乾",
      brand: "Disney",
      category: "零食",
      packageText: "8入",
      costcoPriceJpy: 499,
      twSuggestedPriceTwd: 280,
      promoText: "期間限定",
      sellingPointEvidence: ["intent_score 80", "reseller_signal 70"],
      decision: "list"
    });
    expect(draft.titleTw).toContain("奇奇蒂蒂聯名夾心餅乾");
    expect(draft.titleTw).toContain("日本Costco代購");
    expect(draft.seo.keywords).toContain("日本代購");
    expect(draft.unitPriceTwd).not.toBeNull();
    expect(draft.unitPriceTwd!).toBeGreaterThan(0);
    expect(draft.unitPriceTwd!).toBeLessThan(280);
  });
});