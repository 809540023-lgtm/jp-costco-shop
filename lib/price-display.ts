// 前台價格顯示。
// 專案規則：價格不可推估或補值（AGENTS.md），因此沒有 taiwan_suggested_price 的商品
// 一律顯示「未定價」，不得以 0 元呈現（會被誤讀成免費或 NT$0 報價）。
export const NO_PRICE_LABEL = "未定價";

/** 有正式台幣建議售價（> 0）才算可販售價格。 */
export function hasSuggestedPrice(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(Number(value)) && Number(value) > 0;
}

/** 台幣標註；沒有價格時回「未定價」。 */
export function formatSuggestedPrice(value: number | null | undefined): string {
  return hasSuggestedPrice(value) ? `NT$${Math.round(Number(value)).toLocaleString()}` : NO_PRICE_LABEL;
}

/** 日幣標註（官方抓取值）；沒有價格時回 null，由呼叫端決定不顯示。 */
export function formatJpyPrice(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return `¥${Math.round(Number(value)).toLocaleString()}`;
}
