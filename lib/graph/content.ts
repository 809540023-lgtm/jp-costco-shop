// Agent 5：自動營運 — 自動文案（SPEC 第九節）。
// 對通過 Agent 3/4 門檻（status：listed/top50/weekly_pick/hot_candidate）的商品實體，
// 以 lib/graph/listing-draft.ts 模板產生繁中內容草稿寫入 content_draft；
// 有 Sol 金鑰時潤稿、失敗自動回退模板（無金鑰時規則引擎接管，系統照常運作）。
// 核准／排程發布沿用 2.0 publish 流程（lib/publish.ts）。
import { supabase, audit } from "@/lib/supabase";
import { buildListingDraft, ListingDraft, ListingDraftInput } from "./listing-draft";
import { callLlm } from "./llm";

export const DRAFT_ELIGIBLE_STATUSES = ["listed", "top50", "weekly_pick", "hot_candidate"] as const;

// score_snapshot.reasons 由 pipeline 以 {...decision.reasons, comment, reseller} 儲存，
// 可能是陣列或帶數字鍵的物件；寬容取出 evidence 文字（level>=3 優先）作為賣點證據。
export function sellingPointEvidenceFromReasons(reasons: unknown): string[] {
  const list = (Array.isArray(reasons)
    ? reasons
    : reasons && typeof reasons === "object"
      ? Object.values(reasons as Record<string, unknown>)
      : []) as Array<{ level?: unknown; evidence?: unknown }>;
  const factors = list.filter((r): r is { level?: number; evidence?: string } =>
    !!r && typeof r === "object" && typeof (r as { evidence?: unknown }).evidence === "string"
  );
  const strong = factors.filter((f) => typeof f.level === "number" && f.level >= 3).map((f) => f.evidence as string);
  const rest = factors.filter((f) => !(typeof f.level === "number" && f.level >= 3)).map((f) => f.evidence as string);
  return [...strong, ...rest].filter((s) => s.trim().length > 0);
}

export interface DraftSourceRow {
  id: string;
  canonical_name: string;
  canonical_name_jp: string | null;
  brand: string | null;
  category: string | null;
  status: string;
  latestPriceJpy: number | null;
  latestTwPriceTwd: number | null;
  reasons: unknown;
}

// 純函式：Graph 資料 → 文案模板輸入。promoText 一律為 null：
// 促銷欄位需明確促銷文字證據（OFF／値引／期限），證據由 vision/價格管線另提供，不得憑空產生。
export function draftInputFromRow(row: DraftSourceRow): ListingDraftInput {
  return {
    canonicalNameJp: row.canonical_name_jp,
    canonicalName: row.canonical_name,
    brand: row.brand,
    category: row.category,
    packageText: null,
    costcoPriceJpy: row.latestPriceJpy,
    twSuggestedPriceTwd: row.latestTwPriceTwd,
    promoText: null,
    sellingPointEvidence: sellingPointEvidenceFromReasons(row.reasons),
    decision: row.status
  };
}

// Sol 潤稿輸出（JSON）：僅覆寫指定欄位
export interface SolPolish {
  title_tw?: unknown;
  description_tw?: unknown;
  social_captions?: { line?: unknown; instagram?: unknown };
}

const clean = (v: unknown, fallback: string): string =>
  typeof v === "string" && v.trim() ? v.trim() : fallback;

// 純函式：套用潤稿；格式不符時保留模板草稿
export function applySolPolish(draft: ListingDraft, polish: SolPolish | null): ListingDraft {
  if (!polish || typeof polish !== "object") return draft;
  return {
    ...draft,
    titleTw: clean(polish.title_tw, draft.titleTw),
    descriptionTw: clean(polish.description_tw, draft.descriptionTw),
    socialCaptions: {
      line: clean(polish.social_captions?.line, draft.socialCaptions.line),
      instagram: clean(polish.social_captions?.instagram, draft.socialCaptions.instagram)
    }
  };
}

async function polishDraftWithSol(draft: ListingDraft, input: ListingDraftInput): Promise<{ draft: ListingDraft; polished: boolean }> {
  const res = await callLlm(
    "content_copy",
    "你是日本 Costco 代購的繁體中文文案編輯。依提供的商品資料與草稿，輸出更自然的文案 JSON：" +
      "{\"title_tw\":\"\",\"description_tw\":\"\",\"social_captions\":{\"line\":\"\",\"instagram\":\"\"}}。" +
      "不得虛構價格、容量或促銷資訊。",
    JSON.stringify({ input, draft })
  );
  if (!res) return { draft, polished: false };
  try {
    return { draft: applySolPolish(draft, JSON.parse(res.content) as SolPolish), polished: true };
  } catch {
    return { draft, polished: false };
  }
}

export interface GenerateResult {
  generated: number;
  skippedExisting: number;
  polished: number;
}

// 對每個通過門檻的實體產生草稿：已有 draft／approved 草稿者跳過（不覆蓋人工成果）。
export async function generateContentDrafts(options?: { limit?: number }): Promise<GenerateResult> {
  const { data: entities, error } = await supabase.from("product_entity")
    .select("id, canonical_name, canonical_name_jp, brand, category, status")
    .in("status", [...DRAFT_ELIGIBLE_STATUSES])
    .order("last_activity_at", { ascending: false })
    .limit(options?.limit ?? 50);
  if (error) throw new Error(`商品實體讀取失敗：${error.message}`);

  let generated = 0;
  let skippedExisting = 0;
  let polished = 0;

  for (const e of entities || []) {
    const entity = e as { id: string; canonical_name: string; canonical_name_jp: string | null; brand: string | null; category: string | null; status: string };

    // 已有審核中／已核准草稿 → 不重複產生
    const { data: existing } = await supabase.from("content_draft")
      .select("id").eq("product_id", entity.id).in("publish_status", ["draft", "approved"]).limit(1);
    if (existing && existing.length) { skippedExisting++; continue; }

    // 最新價格觀測：日本 Costco + 台灣通路；最新決策快照作為賣點證據
    const [jp, tw, snap] = await Promise.all([
      supabase.from("price_observation").select("price").eq("product_id", entity.id)
        .eq("market", "costco_jp").order("observed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("price_observation").select("price").eq("product_id", entity.id)
        .in("market", ["tw_ec", "daigou", "costco_tw"]).order("observed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("score_snapshot").select("reasons").eq("product_id", entity.id)
        .order("snapshot_date", { ascending: false }).limit(1).maybeSingle()
    ]);

    const jpRow = (jp?.data ?? null) as { price: unknown } | null;
    const twRow = (tw?.data ?? null) as { price: unknown } | null;
    const snapRow = (snap?.data ?? null) as { reasons: unknown } | null;
    const row: DraftSourceRow = {
      id: entity.id,
      canonical_name: entity.canonical_name,
      canonical_name_jp: entity.canonical_name_jp,
      brand: entity.brand,
      category: entity.category,
      status: entity.status,
      latestPriceJpy: jpRow && jpRow.price != null ? Number(jpRow.price) : null,
      latestTwPriceTwd: twRow && twRow.price != null ? Number(twRow.price) : null,
      reasons: snapRow ? snapRow.reasons : null
    };

    const template = buildListingDraft(draftInputFromRow(row));
    const result = await polishDraftWithSol(template, draftInputFromRow(row));
    if (result.polished) polished++;

    const { error: insertError } = await supabase.from("content_draft").insert({
      product_id: entity.id,
      title_tw: result.draft.titleTw,
      description_tw: result.draft.descriptionTw,
      spec_text: result.draft.specText,
      selling_points: result.draft.sellingPoints,
      seo: result.draft.seo,
      social_captions: result.draft.socialCaptions,
      suggested_price_twd: result.draft.suggestedPriceTwd,
      unit_price_twd: result.draft.unitPriceTwd,
      promo_text: result.draft.promoText,
      publish_status: "draft"
    });
    if (insertError) throw new Error(`內容草稿寫入失敗：${insertError.message}`);
    generated++;
  }

  if (generated) {
    await audit("agent5", "content_drafts_generated", "content_draft", "batch", `generated=${generated},polished=${polished},skipped=${skippedExisting}`);
  }
  return { generated, skippedExisting, polished };
}