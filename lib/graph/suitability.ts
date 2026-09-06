// Agent 3：Taiwan Daigou Suitability Score（SPEC 第七節）。
// 純規則引擎、無 LLM；tw_import_ok=false 為硬性 gate（法規不過，其他分數再高也沒用）。
export interface SuitabilityInput {
  intentScore: number;            // Agent 2：台灣需求
  japanExclusive: number;         // 0–1：台灣難買程度（台灣 EC 查無／「日本限定」訊號）
  priceGapPct: number;            // 價差%：(台灣價−日本價)/台灣價，可為負
  resellerCompetition: number;    // 0–1：代購行情競爭激烈度（越高越差）
  weightG: number | null;         // 重量
  volumeCm3: number | null;       // 材積
  shelfLifeDays: number | null;   // 效期
  fragile: boolean;
  needsColdChain: boolean;
  twImportOk: boolean;            // 硬性 gate
  estimatedMarginTwd: number | null; // 預估毛利（價差−運費估計−手續費）
  hasQualityImage: boolean;       // 視覺吸引力
  repeatPurchaseRate: number;     // 0–1 回購性（歷史訂單）
  avgRating: number | null;       // 日本評價口碑
  resellerSignalScore: number;    // Agent 1：競業推廣
}

export interface SuitabilityResult {
  score: number;                  // 0–100
  hardFail: boolean;              // tw_import_ok=false
  factors: Array<{ factor: string; level: number; evidence: string }>;
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

export function computeSuitability(input: SuitabilityInput): SuitabilityResult {
  const factors: SuitabilityResult["factors"] = [];
  const push = (factor: string, level: number, evidence: string) =>
    factors.push({ factor, level: Math.round(clamp01(level) * 5), evidence });

  // 硬性 gate：法規不允許輸台 → 直接淘汰
  if (!input.twImportOk) {
    push("法規", 0, "法規風險高，不適合輸台（硬性 gate）");
    return { score: 0, hardFail: true, factors };
  }

  const twDemand = clamp01(input.intentScore / 100);
  push("台灣需求", twDemand, `intent_score ${input.intentScore}`);

  const japanExclusivity = clamp01(input.japanExclusive);
  push("日本限定性", japanExclusivity, "台灣供應與 EC 查核結果");

  // 價差：≥50% 滿分；≤0% 零分
  const gap = clamp01(input.priceGapPct / 50);
  push("價差", gap, `價差 ${(input.priceGapPct * 100).toFixed(0)}%`);

  // 代購競爭度（越高越差）
  push("代購競爭度", 1 - clamp01(input.resellerCompetition), "代購行情觀測");

  // 重量：≤1kg 滿分、≥10kg 零分（線性）
  const weightScore = input.weightG == null ? 0.5 : clamp01(1 - (input.weightG - 1000) / 9000);
  push("重量", weightScore, input.weightG == null ? "無重量資料" : `${input.weightG}g`);

  // 體積：≤8000cm³ 滿分、≥60000cm³ 零分
  const volumeScore = input.volumeCm3 == null ? 0.5 : clamp01(1 - (input.volumeCm3 - 8000) / 52000);
  push("體積", volumeScore, input.volumeCm3 == null ? "無材積資料" : `${input.volumeCm3}cm³`);

  // 效期：≥180天滿分、≤30天零分
  const shelf = input.shelfLifeDays == null ? 0.5 : clamp01((input.shelfLifeDays - 30) / 150);
  push("保存期限", shelf, input.shelfLifeDays == null ? "無效期資料" : `${input.shelfLifeDays} 天`);

  // 易碎／冷鏈（運輸風險）
  const fragileRisk = input.fragile || input.needsColdChain;
  push(
    "易碎程度",
    fragileRisk ? 0.2 : 1,
    input.needsColdChain ? "需冷鏈，跨境運輸風險高" : input.fragile ? "易碎，運輸風險高" : "非易碎、常溫"
  );

  // 毛利：≥NT$300 滿分、≤0 零分
  const margin = input.estimatedMarginTwd == null ? 0.3 : clamp01(input.estimatedMarginTwd / 300);
  push("毛利", margin, input.estimatedMarginTwd == null ? "無法估算" : `預估 NT$${input.estimatedMarginTwd}`);

  // 消費者理解度＋視覺吸引力（Sol 摘要與圖片品質的代理指標）
  const visual = (input.hasQualityImage ? 0.6 : 0.2) + 0.4 * clamp01(input.avgRating == null ? 0.5 : (input.avgRating - 3) / 2);
  push("消費者理解度/視覺", clamp01(visual), input.hasQualityImage ? "有高品質圖片" : "缺高品質圖片");

  // 回購性
  push("回購性", clamp01(input.repeatPurchaseRate), `歷史回購率 ${(input.repeatPurchaseRate * 100).toFixed(0)}%`);

  // 競業推廣（其他代購正在推 → 需求驗證，但也暗示競爭；以正訊號計）
  push("競業推廣", clamp01(input.resellerSignalScore / 100), `reseller_signal ${input.resellerSignalScore}`);

  // 口碑
  push("評論口碑", input.avgRating == null ? 0.4 : clamp01((input.avgRating - 3) / 2), input.avgRating == null ? "無評價資料" : `平均 ${input.avgRating}`);

  const weights: Record<string, number> = {
    "台灣需求": 14, "日本限定性": 10, "價差": 12, "代購競爭度": 6,
    "重量": 8, "體積": 5, "保存期限": 5, "易碎程度": 4, "毛利": 12,
    "消費者理解度/視覺": 6, "回購性": 5, "競業推廣": 8, "評論口碑": 5
  };
  let total = 0;
  for (const f of factors) {
    const w = weights[f.factor] ?? 0;
    total += (f.level / 5) * w;
  }
  const score = Math.round(total * 100) / 100;
  return { score: Math.max(0, Math.min(100, score)), hardFail: false, factors };
}