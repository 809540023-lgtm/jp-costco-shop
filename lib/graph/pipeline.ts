// 3.0 每日管線：Product Intelligence Graph 評分與決策編排（SPEC 第五～八節）。
// 對每個商品實體：Agent1 reseller signal → Agent2 intent → Agent3 suitability
// →（通過門檻才）Agent4 決策 → 寫入 score_snapshot。全程可用規則引擎完成（Astra 可選）。
import { supabase } from "@/lib/supabase";
import { graphConfig } from "./config";
import { resellerSignal, ResellerMentionLike } from "./reseller-signal";
import { intentScore, IntentEventLike } from "./intent-classifier";
import { computeSuitability, SuitabilityInput } from "./suitability";
import { decideWithOptionalAstra, AstraDecisionProvider, DecisionInput, DecisionResult } from "./decision";

const JPY_TWD = Number(process.env.JPY_TWD_RATE || "0.22");
const HANDLING_PCT = Number(process.env.HANDLING_PCT || "0.1"); // 代購手續與包裝估計
const SHIPPING_TWD_PER_KG = Number(process.env.SHIPPING_TWD_PER_KG || "160"); // 國際運費粗估（人工閘門最終確認）

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface PipelineRow {
  entityId: string;
  resellerScore: number;
  intentScore: number;
  suitabilityScore: number;
  recommendationScore: number;
  decision: string;
  modelUsed: string;
}

async function fetchMentions(entityId: string, since: Date): Promise<ResellerMentionLike[]> {
  const { data } = await supabase
    .from("reseller_mention")
    .select("reseller_key, platform, is_first_mention, engagement, mentioned_at")
    .eq("product_id", entityId)
    .gte("mentioned_at", since.toISOString())
    .order("mentioned_at", { ascending: false })
    .limit(500);
  return (data || []).map((r) => ({
    resellerKey: r.reseller_key,
    platform: r.platform,
    isFirstMention: r.is_first_mention ?? false,
    engagement: r.engagement,
    mentionedAt: r.mentioned_at
  }));
}

async function fetchIntents(entityId: string, since: Date): Promise<IntentEventLike[]> {
  const { data } = await supabase
    .from("intent_signal")
    .select("intent_class, intent_weight, created_at")
    .eq("product_id", entityId)
    .gte("created_at", since.toISOString())
    .limit(1000);
  return (data || []).map((r) => ({
    intentClass: r.intent_class,
    intentWeight: Number(r.intent_weight),
    createdAt: r.created_at
  }));
}

interface PriceRow { market: string; price: string | number; observed_at: string }

async function latestPrice(entityId: string, markets: string[]): Promise<PriceRow | null> {
  const { data } = await supabase
    .from("price_observation")
    .select("market, price, observed_at")
    .eq("product_id", entityId)
    .in("market", markets)
    .order("observed_at", { ascending: false })
    .limit(1);
  return (data && data[0]) || null;
}

async function fetchLogistics(entityId: string): Promise<LogisticsRow | null> {
  const { data } = await supabase
    .from("logistics_profile")
    .select("weight_g, volume_cm3, shelf_life_days, fragile, needs_cold_chain, tw_import_ok")
    .eq("product_id", entityId)
    .maybeSingle();
  return (data as LogisticsRow | null) ?? null;
}

interface LogisticsRow {
  weight_g: number | null;
  volume_cm3: number | null;
  shelf_life_days: number | null;
  fragile: boolean | null;
  needs_cold_chain: boolean | null;
  tw_import_ok: boolean | null;
}

function estimatedMarginTwd(jpPriceJpy: number | null, twPrice: number | null, weightG: number | null): number | null {
  if (jpPriceJpy == null || twPrice == null) return null;
  const jpTwd = jpPriceJpy * JPY_TWD;
  const shipping = weightG != null ? (weightG / 1000) * SHIPPING_TWD_PER_KG : 150;
  return Math.round(twPrice - jpTwd * (1 + HANDLING_PCT) - shipping);
}

export async function runPipelineForEntity(
  entity: { id: string; canonical_name: string; canonical_name_jp: string | null; brand: string | null },
  now: Date,
  astra?: AstraDecisionProvider
): Promise<PipelineRow> {
  const since90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sinceIntent = new Date(now.getTime() - graphConfig.intent.windowDays * 24 * 60 * 60 * 1000);

  const [mentions, intents, logistics] = await Promise.all([
    fetchMentions(entity.id, since90),
    fetchIntents(entity.id, sinceIntent),
    fetchLogistics(entity.id)
  ]);
  const signal = resellerSignal(mentions, now);
  const intent = intentScore(intents, now);

  // 價差：日本 Costco 最新價 vs 台灣 EC／代購最新觀測
  const [jpPrice, twPrice] = await Promise.all([
    supabase.from("price_observation").select("market, price, observed_at").eq("product_id", entity.id)
      .in("market", ["costco_jp"]).order("observed_at", { ascending: false }).limit(1),
    supabase.from("price_observation").select("market, price, observed_at").eq("product_id", entity.id)
      .in("market", ["tw_ec", "daigou", "costco_tw"]).order("observed_at", { ascending: false }).limit(1)
  ]);
  const jpPriceJpy = jpPrice.data && jpPrice.data[0] ? Number((jpPrice.data[0] as PriceRow).price) : null;
  const twPriceTwd = twPrice.data && twPrice.data[0] ? Number((twPrice.data[0] as PriceRow).price) : null;
  const priceGapPct = jpPriceJpy != null && twPriceTwd ? Math.max(-1, Math.min(1, (twPriceTwd - jpPriceJpy * JPY_TWD) / twPriceTwd)) : 0;

  // 日本限定性代理：台灣無價格觀測 → 假設難買；有 → 需查價差
  const japanExclusive = twPriceTwd == null ? 1 : 0.5;

  // 日本評價（review_snapshot 由每日擷取寫入；尚無資料時維持 null）
  const { data: reviewRows } = await supabase
    .from("review_snapshot")
    .select("avg_rating, observed_at")
    .eq("product_id", entity.id)
    .eq("market", "jp")
    .order("observed_at", { ascending: false })
    .limit(1);
  const avgRating = reviewRows && reviewRows[0] ? numOrNull((reviewRows[0] as { avg_rating: unknown }).avg_rating) : null;

  const suitability = computeSuitability({
    intentScore: intent,
    japanExclusive: twPriceTwd == null ? 1 : 0.6,
    priceGapPct,
    resellerCompetition: twPrice.data && twPrice.data[0] && (twPrice.data[0] as PriceRow).market === "daigou" ? 0.6 : 0.2,
    weightG: logistics?.weight_g ?? null,
    volumeCm3: logistics?.volume_cm3 ?? null,
    shelfLifeDays: logistics?.shelf_life_days ?? null,
    fragile: logistics?.fragile ?? false,
    needsColdChain: logistics?.needs_cold_chain ?? false,
    twImportOk: logistics?.tw_import_ok ?? true,
    estimatedMarginTwd: estimatedMarginTwd(jpPriceJpy, twPriceTwd, logistics?.weight_g ?? null),
    hasQualityImage: false, // 由素材管線補充；預設保守
    repeatPurchaseRate: 0,  // 歷史訂單回購率：訂單累積後由分析補上
    avgRating,
    resellerSignalScore: signal.score
  });

  const decisionInput: DecisionInput = {
    resellerSignalScore: signal.score,
    intentScore: intent,
    suitabilityScore: suitability.score,
    hardFail: suitability.hardFail,
    factors: suitability.factors.map((f) => ({ factor: f.factor, level: f.level, evidence: f.evidence }))
  };
  const decision: DecisionResult = await decideWithOptionalAstra(
    { id: entity.id, canonicalName: entity.canonical_name, canonicalNameJp: entity.canonical_name_jp, brand: entity.brand },
    decisionInput,
    astra
  );

  const snapshotDate = now.toISOString().slice(0, 10);
  await supabase.from("score_snapshot").upsert({
    product_id: entity.id,
    snapshot_date: snapshotDate,
    reseller_signal_score: signal.score,
    intent_score: intent,
    suitability_score: suitability.score,
    recommendation_score: decision.recommendationScore,
    decision: decision.decision,
    reasons: { ...decision.reasons, comment: decision.comment, reseller: signal },
    model_used: decision.modelUsed
  }, { onConflict: "product_id,snapshot_date" });

  // 決策同步回 product_entity.status（漏斗狀態流）
  const statusMap: Record<string, string> = {
    reject: "rejected", observe: "observing", list: "listed",
    top50: "top50", weekly_pick: "weekly_pick", hot_candidate: "hot_candidate"
  };
  const newStatus = statusMap[decision.decision];
  if (newStatus) {
    await supabase.from("product_entity").update({
      status: newStatus, last_activity_at: new Date().toISOString()
    }).eq("id", entity.id);
  }

  return {
    entityId: entity.id,
    resellerScore: signal.score,
    intentScore: intent,
    suitabilityScore: suitability.score,
    recommendationScore: decision.recommendationScore,
    decision: decision.decision,
    modelUsed: decision.modelUsed
  };
}

export async function runDailyPipeline(options?: { limit?: number; astra?: AstraDecisionProvider }): Promise<PipelineRow[]> {
  const now = new Date();
  const { data: entities, error } = await supabase
    .from("product_entity")
    .select("id, canonical_name, canonical_name_jp, brand")
    .neq("status", "rejected")
    .order("last_activity_at", { ascending: false })
    .limit(options?.limit ?? 200);
  if (error) throw new Error(`商品實體讀取失敗：${error.message}`);

  const results: PipelineRow[] = [];
  for (const entity of entities || []) {
    results.push(await runPipelineForEntity(entity as never, now, options?.astra));
  }
  return results;
}