// 商品排名邏輯：依規格書第四節，分數 0~100，保留每項來源與計算方式。

export interface RankingInput {
  isHotBuy: boolean;
  isNew: boolean;
  reviewCount: number;
  rating: number | null;
  japanExclusive: number; // 0~1 日本限定程度
  taiwanDemand: number; // 0~1 台灣市場需求
  logisticsFit: number; // 0~1 跨境物流適合度（輕量、常溫）
  regulationRisk: number; // 0~1 法規風險（越高越差）
  profitSpeed: number; // 0~1 利潤與資金回收速度
  marketBuzz: number; // 0~1 日本市場討論度
}

export interface ScoreBreakdown {
  officialHotBuy: number;
  officialNew: number;
  reviews: number;
  japanExclusive: number;
  taiwanDemand: number;
  logisticsFit: number;
  regulationRisk: number;
  profitSpeed: number;
  marketBuzz: number;
  total: number;
}

// 各分項權重（合計 100）
const W = {
  officialHotBuy: 15,
  officialNew: 10,
  reviews: 10,
  japanExclusive: 15,
  taiwanDemand: 15,
  logisticsFit: 15,
  regulationRisk: 10,
  profitSpeed: 5,
  marketBuzz: 5
};

export function scoreProduct(input: RankingInput): ScoreBreakdown {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const parts = {
    officialHotBuy: input.isHotBuy ? W.officialHotBuy : 0,
    officialNew: input.isNew ? W.officialNew : 0,
    reviews: clamp((input.reviewCount / 200) * 0.6 + (input.rating ? (input.rating / 5) * 0.4 : 0)) * W.reviews,
    japanExclusive: clamp(input.japanExclusive) * W.japanExclusive,
    taiwanDemand: clamp(input.taiwanDemand) * W.taiwanDemand,
    logisticsFit: clamp(input.logisticsFit) * W.logisticsFit,
    regulationRisk: (1 - clamp(input.regulationRisk)) * W.regulationRisk,
    profitSpeed: clamp(input.profitSpeed) * W.profitSpeed,
    marketBuzz: clamp(input.marketBuzz) * W.marketBuzz
  };
  const total = Math.round(Object.values(parts).reduce((s, v) => s + v, 0) * 100) / 100;
  return { ...parts, total };
}

// 排除條件：全球常見、體積大、重量高、台灣易買、法規高風險
export function shouldExclude(input: {
  isGlobalCommon: boolean;
  bulky: boolean;
  heavy: boolean;
  perishable: boolean;
  highRegulation: boolean;
  easilyAvailableInTaiwan: boolean;
}): boolean {
  return Boolean(
    input.isGlobalCommon ||
    input.bulky ||
    input.heavy ||
    input.perishable ||
    input.highRegulation ||
    input.easilyAvailableInTaiwan
  );
}
