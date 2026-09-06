import { describe, it, expect } from "vitest";
import { computeShippingTotal } from "../lib/graph/procurement";
import { formatPurchaseListSummary } from "../lib/line";

describe("Agent 6 運費閘門計價", () => {
  it("商品小計 + 實際運費 + 報關費 = 應付總額", () => {
    expect(computeShippingTotal(1000, 350, 30)).toBe(1380);
  });
  it("運費與報關費為 0 時維持商品小計", () => {
    expect(computeShippingTotal(1000, 0, 0)).toBe(1000);
  });
  it("字串數字也能計算（DB numeric 回傳型別）", () => {
    expect(computeShippingTotal("1000" as unknown as number, "350" as unknown as number, 0)).toBe(1350);
  });
});

describe("Agent 6 採購清單摘要", () => {
  it("彙總商品名稱與數量", () => {
    const s = formatPurchaseListSummary({ items: [{ productName: "A 商品", quantity: 3 }], totalItems: 3 });
    expect(s).toContain("待採購清單");
    expect(s).toContain("合計 3 件");
    expect(s).toContain("A 商品 ×3");
  });
  it("超過 20 項時只列前 20 並提示略過數", () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ productName: `P${i + 1}`, quantity: 1 }));
    const s = formatPurchaseListSummary({ items, totalItems: 25 });
    expect(s).toContain("P20 ×1");
    expect(s).not.toContain("P21");
    expect(s).toContain("…等 25 項商品");
  });
  it("空清單產生基本標題", () => {
    const s = formatPurchaseListSummary({ items: [], totalItems: 0 });
    expect(s).toContain("合計 0 件");
  });
});