import { describe, expect, it } from "vitest";
import { formatJpyPrice, formatSuggestedPrice, hasSuggestedPrice, NO_PRICE_LABEL } from "@/lib/price-display";

// 專案規則：價格不可推估或補值。沒有定價的商品必須顯示「未定價」，
// 不可顯示 NT$0（會被誤讀成免費，且可被加入購物車產生 0 元訂單）。
describe("price-display", () => {
  it("沒有台幣定價時不顯示 NT$0", () => {
    expect(formatSuggestedPrice(null)).toBe(NO_PRICE_LABEL);
    expect(formatSuggestedPrice(undefined)).toBe(NO_PRICE_LABEL);
    expect(formatSuggestedPrice(0)).toBe(NO_PRICE_LABEL);
    expect(formatSuggestedPrice(NaN)).toBe(NO_PRICE_LABEL);
    expect(formatSuggestedPrice(null)).not.toContain("NT$");
  });

  it("有定價時顯示千分位台幣", () => {
    expect(formatSuggestedPrice(1440)).toBe("NT$1,440");
    expect(formatSuggestedPrice(1440.6)).toBe("NT$1,441");
  });

  it("hasSuggestedPrice 只認大於 0 的有限數", () => {
    expect(hasSuggestedPrice(1)).toBe(true);
    expect(hasSuggestedPrice(0)).toBe(false);
    expect(hasSuggestedPrice(-5)).toBe(false);
    expect(hasSuggestedPrice(Infinity)).toBe(false);
    expect(hasSuggestedPrice(null)).toBe(false);
  });

  it("日幣價格抓不到時回 null（呼叫端不顯示）", () => {
    expect(formatJpyPrice(null)).toBeNull();
    expect(formatJpyPrice(0)).toBeNull();
    expect(formatJpyPrice(4997)).toBe("¥4,997");
  });
});
