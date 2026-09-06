// Agent 2 寫入層：留言 → 關鍵字規則分類（高權重類直接採用）→ 模糊案例才升級 AI → intent_signal。
// AI 未設定或失敗時一律降級回規則結果，系統照常運作（SPEC 14.1：降級不阻塞）。
import { supabase } from "@/lib/supabase";
import {
  classifyComment,
  INTENT_CLASSES,
  IntentClass,
  IntentClassification
} from "./intent-classifier";
import { callLlm, isAstraConfigured } from "./llm";
import { graphConfig } from "./config";

export type LlmIntentFn = (text: string) => Promise<IntentClass | null>;

export interface CommentItem {
  commentId: string;
  videoId: string;
  text: string;
  author?: string;
  publishedAt?: string;
  likes?: number;
}

const VALID_CLASSES = new Set<string>(INTENT_CLASSES);

// 模糊案例（規則判為 neutral）才呼叫 Astra 意圖理解；金鑰未設定時 fn 為 null 直接回規則結果。
async function defaultLlmIntent(text: string): Promise<IntentClass | null> {
  if (!isAstraConfigured()) return null;
  const res = await callLlm(
    "intent",
    "你是消費者留言購買意圖分類器。判斷留言屬於哪一類，只輸出 JSON：{\"intent_class\":\"want_buy|asking_daigou|asking_price|asking_where|positive_review|neutral|like_only|negative|exists_tw\"}",
    text,
    { json: true }
  );
  if (!res) return null;
  try {
    const parsed = JSON.parse(res.content) as { intent_class?: string };
    return parsed.intent_class && VALID_CLASSES.has(parsed.intent_class)
      ? (parsed.intent_class as IntentClass)
      : null;
  } catch {
    return null;
  }
}

export async function classifyCommentWithUpgrade(
  text: string,
  llmFn?: LlmIntentFn
): Promise<IntentClassification> {
  const rule = classifyComment(text);
  // 只有模糊案例（neutral）才升級 AI；明確類別直接採用規則結果
  if (rule.intentClass !== "neutral") return rule;
  const fn = llmFn ?? defaultLlmIntent;
  try {
    const ai = await fn(text);
    if (ai && VALID_CLASSES.has(ai)) {
      return {
        intentClass: ai,
        weight: graphConfig.intent.weights[ai],
        classifiedBy: "ai",
        matched: rule.matched
      };
    }
  } catch {
    // AI 失敗 → 降級規則結果
  }
  return rule;
}

export interface VideoIntentsResult {
  commentsConsidered: number;
  signalsCreated: number;
  aiUpgraded: number;
}

// 將影片留言分類後寫入 intent_signal。
// 去重：同一 source_listing 下已存在的 text_raw 不重複寫入（每日 cron 重跑安全）。
export async function ingestVideoIntents(
  matchedListings: Array<{ listingId: string; videoId: string; productId: string }>,
  commentsByVideo: Map<string, CommentItem[]>,
  llmFn?: LlmIntentFn
): Promise<VideoIntentsResult> {
  const result: VideoIntentsResult = { commentsConsidered: 0, signalsCreated: 0, aiUpgraded: 0 };
  for (const m of matchedListings) {
    const comments = commentsByVideo.get(m.videoId) || [];
    if (!comments.length) continue;
    const { data: existing } = await supabase
      .from("intent_signal")
      .select("text_raw")
      .eq("source_listing_id", m.listingId)
      .limit(200);
    const seen = new Set((existing || []).map((r) => r.text_raw));
    for (const c of comments) {
      const text = (c.text || "").trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      result.commentsConsidered += 1;
      const cls = await classifyCommentWithUpgrade(text, llmFn);
      if (cls.classifiedBy === "ai") result.aiUpgraded += 1;
      const { error } = await supabase.from("intent_signal").insert({
        product_id: m.productId,
        source_listing_id: m.listingId,
        platform: "youtube",
        text_raw: text,
        intent_class: cls.intentClass,
        intent_weight: cls.weight,
        classified_by: cls.classifiedBy,
        ...(c.publishedAt ? { created_at: c.publishedAt } : {})
      });
      if (!error) result.signalsCreated += 1;
    }
  }
  return result;
}