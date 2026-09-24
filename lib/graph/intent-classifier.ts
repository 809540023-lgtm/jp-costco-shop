// Agent 2：消費者購買意圖規則引擎（SPEC 第六節）。
// 先規則、後 Sol、極少數 Astra：模糊案例由呼叫端升級，本模組永遠可用（無外部依賴）。
import { graphConfig } from "./config";

export const INTENT_CLASSES = [
  "want_buy", "asking_daigou", "asking_price", "asking_where",
  "positive_review", "neutral", "like_only", "negative", "exists_tw"
] as const;

export type IntentClass = (typeof INTENT_CLASSES)[number];

export interface IntentClassification {
  intentClass: IntentClass;
  weight: number;
  classifiedBy: "rule" | "ai";
  matched: string[];
}

// 意圖關鍵詞（依規格例句與台灣社群常用語；扣分訊號優先級最高）
const RULES: Array<{ cls: IntentClass; patterns: RegExp[] }> = [
  { cls: "exists_tw", patterns: [/全聯就有/, /台灣\s*(Costco|好市多)?\s*就有/, /台灣也(有|買得到)/, /家樂福就有/, /不用代購/] },
  { cls: "negative", patterns: [/不好吃/, /不好用/, /很雷/, /踩雷/, /後悔/, /太貴了/, /不值/] },
  { cls: "want_buy", patterns: [/想買/, /好想(買|收)/, /想要(這|一個|買)/, /幫(我)?買/, /必買/, /衝(一波|了)?/i] },
  { cls: "asking_daigou", patterns: [/求代購/, /可以代購/, /代購嗎/, /有人代購/, /求連結/, /哪裡可以(買|訂)/, /求解(購|買)/] },
  { cls: "asking_price", patterns: [/多少錢/, /幾多錢/, /價格/, /售價/, /多少(塊|元|\$)/, /怎麼算/] },
  { cls: "asking_where", patterns: [/台灣買得到/, /Costco哪(一|間|裡)/, /日本才有嗎/, /日本限定嗎/, /哪裡買/] },
  { cls: "positive_review", patterns: [/買過/, /回購/, /很好(用|吃)/, /好吃/, /好用/, /推薦/, /上次買/] },
  { cls: "neutral", patterns: [/這是什麼/, /什麼牌子/, /日文怎麼(唸|說)/, /有人知道嗎/] }
];

const LIKE_ONLY = /^[^\u4e00-\u9fa5a-z]*(❤|💗|👍|😍|🥰|好可愛|可愛|美|漂亮|讚|\+1|nice)+[^\u4e00-\u9fa5a-z]*$/i;

export function classifyComment(textRaw: string): IntentClassification {
  const text = (textRaw || "").trim();
  const matched: string[] = [];
  if (!text) {
    return { intentClass: "like_only", weight: graphConfig.intent.weights.like_only, classifiedBy: "rule", matched: [] };
  }
  for (const rule of RULES) {
    for (const p of rule.patterns) {
      const m = text.match(p);
      if (m) {
        matched.push(m[0]);
        break;
      }
    }
    if (matched.length) {
      return { intentClass: rule.cls, weight: graphConfig.intent.weights[rule.cls], classifiedBy: "rule", matched };
    }
  }
  if (LIKE_ONLY.test(text)) {
    return { intentClass: "like_only", weight: graphConfig.intent.weights.like_only, classifiedBy: "rule", matched: [] };
  }
  return { intentClass: "neutral", weight: graphConfig.intent.weights.neutral, classifiedBy: "rule", matched: [] };
}

export interface IntentEventLike {
  intentClass: string;
  intentWeight: number;
  createdAt: Date | string;
}

// intent_score（0–100）＝近 30 天加權意圖總量（對數尺度）＋「想買類」佔比調整。
export function intentScore(events: IntentEventLike[], now: Date = new Date()): number {
  const windowMs = graphConfig.intent.windowDays * 24 * 60 * 60 * 1000;
  let total = 0;
  let wantBuyWeight = 0;
  for (const e of events) {
    const t = new Date(e.createdAt).getTime();
    if (Number.isNaN(t) || now.getTime() - t > windowMs) continue;
    total += e.intentWeight;
    if (e.intentClass === "want_buy" || e.intentClass === "asking_daigou") wantBuyWeight += e.intentWeight;
  }
  if (total <= 0) return 0;
  const K = 30; // 對數尺度：30 則高意圖留言即接近滿分
  const base = 100 * (Math.log(1 + Math.max(0, total)) / Math.log(1 + K * Math.max(0, total)));
  const share = total > 0 ? wantBuyWeight / total : 0; // 想買類佔比 0–1
  const score = base * (0.8 + 0.2 * share);
  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}