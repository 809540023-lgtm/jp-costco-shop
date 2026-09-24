// Agent 4：AI 採購主管（SPEC 第八節）。
// Astra 只在通過 Agent 3 門檻的候選上使用；本模組提供規則 fallback，
// LLM provider 由 lib/graph/llm.ts 注入（無金鑰時自動降級為 rules）。
import { graphConfig } from "./config";

export type Decision = "reject" | "observe" | "list" | "top50" | "weekly_pick" | "hot_candidate";

export interface DecisionFactor {
  factor: string;
  level: number; // 1–5
  evidence: string;
}

export interface DecisionInput {
  resellerSignalScore: number;
  intentScore: number;
  suitabilityScore: number;
  hardFail: boolean;
  factors: DecisionFactor[];
}

export interface DecisionResult {
  recommendationScore: number;
  decision: Decision;
  reasons: DecisionFactor[];
  comment: string;
  modelUsed: string;
}

// 決策映射（SPEC 8.3，門檻可調）
export function mapDecision(score: number): Decision {
  if (score >= graphConfig.decision.weeklyPick) return "weekly_pick";
  if (score >= graphConfig.decision.list) return "list";
  if (score >= graphConfig.decision.observe) return "observe";
  return "reject";
}

export function ruleDecision(input: DecisionInput): DecisionResult {
  if (input.hardFail) {
    return {
      recommendationScore: 0,
      decision: "reject",
      reasons: input.factors.filter((f) => f.factor === "法規"),
      comment: "不上架。法規不允許輸台，其他條件再好也不考慮。",
      modelUsed: "rules"
    };
  }
  // 推薦分＝適合度為主體，需求與推廣訊號調整
  const raw =
    input.suitabilityScore * 0.6 +
    input.intentScore * 0.25 +
    input.resellerSignalScore * 0.15;
  const recommendationScore = Math.round(raw * 100) / 100;
  const decision = mapDecision(recommendationScore);
  const reasons = [...input.factors]
    .sort((a, b) => b.level - a.level)
    .slice(0, 3);
  const comment =
    decision === "weekly_pick"
      ? "建議本週主推：需求、價差與物流條件俱佳，競業推廣同步上升。"
      : decision === "hot_candidate"
      ? "爆品候選：多個代購業者短期內同時推廣，建議提高關注並準備素材。"
      : decision === "list"
      ? "建議上架：整體條件通過門檻，可排入一般上架。"
      : decision === "observe"
      ? "暫列觀察：尚有條件不足（需求或物流），持續觀察訊號變化。"
      : "不上架：整體條件未達門檻。";
  return { recommendationScore: recommendationScore, decision, reasons, comment, modelUsed: "rules" };
}

// Astra 供應商介面：只有通過門檻的候選才會呼叫（SPEC 模型路由原則）。
export type AstraDecisionProvider = (
  entity: { id: string; canonicalName: string; brand: string | null },
  input: DecisionInput
) => Promise<{ recommendationScore: number; decision: Decision; reasons: DecisionFactor[]; comment: string } | null>;

export async function decideWithOptionalAstra(
  entity: { id: string; canonicalName: string; canonicalNameJp?: string | null; brand: string | null },
  input: DecisionInput,
  astra?: AstraDecisionProvider
): Promise<DecisionResult> {
  const fallback = ruleDecision(input);
  if (input.hardFail || !astra) return fallback;
  // 門檻外不浪費 Astra 額度
  if (input.intentScore < graphConfig.intent.threshold) return fallback;
  if (input.suitabilityScore < graphConfig.suitability.fitThreshold) return fallback;
  try {
    const astraResult = await astra(entity, input);
    if (astraResult) {
      return { ...astraResult, modelUsed: "astra" };
    }
  } catch {
    // Astra 失敗不阻塞主流程
  }
  return fallback;
}