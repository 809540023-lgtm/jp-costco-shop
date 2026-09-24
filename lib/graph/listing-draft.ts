// Agent 5：自動營運 — 通過門檻的商品自動產生繁中內容草稿（SPEC 第九節）。
// 文案以模板產生（可離線、可測試）；有 Sol 金鑰時可再呼叫 LLM 潤稿（lib/graph/llm.ts）。
// 核准後發布仍沿用 2.0 既有 publish 流程（app/api/admin/products/publish）。

export interface ListingDraftInput {
  canonicalNameJp: string | null;
  canonicalName: string;
  brand: string | null;
  category: string | null;
  packageText: string | null;      // 容量／數量敘述
  costcoPriceJpy: number | null;
  twSuggestedPriceTwd: number | null;
  promoText: string | null;        // 限時特價資訊
  sellingPointEvidence: string[];  // 來自 score_snapshot.reasons
  decision: string;
}

export interface ListingDraft {
  titleTw: string;
  descriptionTw: string;
  specText: string;
  sellingPoints: string[];
  seo: { keywords: string[]; description: string };
  socialCaptions: { line: string; instagram: string };
  suggestedPriceTwd: number | null;
  unitPriceTwd: number | null;
  promoText: string | null;
}

const JPY_TWD = Number(process.env.JPY_TWD_RATE || "0.22"); // 匯率集中於計算層（SPEC 14.6）

function unitPriceOf(packageText: string | null, total: number): number | null {
  const m = packageText ? packageText.match(/(\d+)\s*(入|顆|包|罐|瓶|盒|碗|片|雙|入裝)/) : null;
  if (!m || !total) return null;
  const count = Number(m[1]);
  if (!count) return null;
  return Math.round((total / count) * 10) / 10;
}

export function buildListingDraft(input: ListingDraftInput): ListingDraft {
  const brandPrefix = input.brand ? `${input.brand} ` : "";
  const packageSuffix = input.packageText ? `（${input.packageText}）` : "";
  const titleTw = `${brandPrefix}${input.canonicalName}${packageSuffix} 日本Costco代購`;

  const priceJp = input.costcoPriceJpy != null ? `日本Costco價格 ¥${input.costcoPriceJpy.toLocaleString()}` : null;
  const priceTw = input.twSuggestedPriceTwd != null ? `台灣建議售價 NT$${Math.round(input.twSuggestedPriceTwd)}` : null;
  const promo = input.promoText ? `🎁 ${input.promoText}` : null;

  const sellingPoints = [
    ...input.sellingPointEvidence.slice(0, 3),
    input.packageText ? `內容：${input.packageText}` : "日本Costco限定流通規格",
    "台灣現貨集運、一站式代購服務"
  ].filter(Boolean) as string[];

  const descriptionTw = [
    `${brandPrefix}${input.canonicalName}由日本Costco門市直送。`,
    priceJp, priceTw, promo,
    sellingPoints.length ? `推薦理由：${sellingPoints.join("、")}。` : null,
    "本商品由系統綜合台灣需求、價差與物流適合度自動選品，人工確認後上架。"
  ].filter(Boolean).join("\n");

  const keywords = [
    input.canonicalName,
    input.brand,
    `${input.brand ?? ""}日本Costco`,
    "日本代購",
    "好市多代購",
    input.category ?? "日本Costco代購"
  ].filter(Boolean) as string[];

  return {
    titleTw,
    descriptionTw,
    specText: input.packageText ?? "規格以實際包裝標示為準",
    sellingPoints,
    seo: { keywords, description: `${titleTw}｜${priceJp ?? "日本Costco直送"}｜日本代購、好市多代購` },
    socialCaptions: {
      line: `🔥 ${titleTw}\n${priceTw ?? ""} 日本直送，數量有限！`,
      instagram: `${brandPrefix}${input.canonicalName} 🇯🇵\n日本Costco必買！${promo ?? ""}\n#日本代購 #好市多 #${input.category ?? "Costco必買"}`
    },
    suggestedPriceTwd: input.twSuggestedPriceTwd,
    unitPriceTwd: input.twSuggestedPriceTwd != null
      ? unitPriceOf(input.packageText, input.twSuggestedPriceTwd)
      : unitPriceOf(input.packageText, input.costcoPriceJpy != null ? Math.round(input.costcoPriceJpy * JPY_TWD) : 0),
    promoText: input.promoText
  };
}