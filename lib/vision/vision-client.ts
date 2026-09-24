// Vision 辨識：現場照片／價牌 → 結構化候選資料（Candidate Data）。
// 依交接規則：辨識結果一律是 CANDIDATE，回看原圖人工確認後才能 VERIFIED；
// 單一價格不是特價證據，需 OFF／値引／割引／期限／SALE／SPECIAL PRICE 文字。
import { z } from "zod";
import { callVision } from "@/lib/graph/llm";

export const VisionResultSchema = z.object({
  context_only: z.boolean().default(false), // 情境照（人物、賣場全景）無商品內容
  product_name: z.string().nullish(),
  brand: z.string().nullish(),
  costco_item_number: z.string().nullish(),
  jan: z.string().nullish(),
  package_quantity: z.number().nullish(),
  package_unit: z.string().nullish(),
  observed_price_jpy: z.number().nullish(),
  regular_price_jpy: z.number().nullish(),
  sale_price_jpy: z.number().nullish(),
  sale_evidence: z.string().nullish(),
  sale_end_date: z.string().nullish(),
  confidence: z.number().min(0).max(1).nullish()
});

export type VisionResult = z.infer<typeof VisionResultSchema>;

export const VISION_SYSTEM_PROMPT = `你是日本 Costco 現場照片辨識助手。輸入是商品照或價牌照。
規則：
1. 只輸出 JSON，欄位：context_only, product_name, brand, costco_item_number, jan, package_quantity, package_unit, observed_price_jpy, regular_price_jpy, sale_price_jpy, sale_evidence, sale_end_date, confidence(0-1)。
2. 情境照（人物、賣場走道、無商品或無法辨識）→ context_only=true，其他欄位留空。
3. 價格一律為日幣數字；看不清楚就 null，不要猜。
4. 特價證據規則：只有價牌出現「通常価格」「OFF」「値引」「割引」「期限」「SALE」「SPECIAL PRICE」等促銷文字時，才可填 sale_evidence（原文）與 sale_price_jpy／regular_price_jpy；只看到單一價格時 sale_evidence 與 sale_price_jpy 一律 null，只填 observed_price_jpy。
5. costco_item_number 是價牌上的 4-6 位商品編號；jan 是條碼數字。`;

// 解析並正規化模型輸出（含特價證據規則）
export function parseVisionResult(raw: string): VisionResult | null {
  let jsonText = raw.trim();
  const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) jsonText = fenced[1].trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = VisionResultSchema.safeParse(JSON.parse(jsonText.slice(start, end + 1)));
    if (!parsed.success) return null;
    return applySaleEvidenceRule(parsed.data);
  } catch {
    return null;
  }
}

export function applySaleEvidenceRule(v: VisionResult): VisionResult {
  const hasEvidence = Boolean(v.sale_evidence && /通常価格|OFF|値引|割引|SALE|SPECIAL\s*PRICE|期限/i.test(v.sale_evidence));
  if (!hasEvidence) {
    return {
      ...v,
      sale_evidence: null,
      sale_price_jpy: null,
      regular_price_jpy: null,
      sale_end_date: null,
      observed_price_jpy: v.observed_price_jpy ?? v.sale_price_jpy ?? v.regular_price_jpy ?? null
    };
  }
  return v;
}

// 呼叫 vision 模型（OpenAI 相容 image_url）；未設定金鑰回 null（呼叫端標記 NEEDS_REVIEW）。
export async function visionOnImage(imageUrl: string, hint?: string): Promise<VisionResult | null> {
  const userText = `${hint ? `拍攝資訊：${hint}\n` : ""}辨識這張照片。`;
  const res = await callVision(VISION_SYSTEM_PROMPT, userText, imageUrl);
  if (!res) return null;
  return parseVisionResult(res.content);
}