// Vision 管線：Queue（已轉檔）→ Vision 辨識候選 → 商品/價牌配對候選。
// 全部產出都是 CANDIDATE / NEEDS_REVIEW，人工確認後才可發布（交接規則）。
import { supabase } from "@/lib/supabase";
import { visionOnImage, VisionResult } from "./vision-client";
import { pairCandidates, PairCandidate, PairingProposal } from "./pairing";

const MAX_RETRIES = 3;

export interface VisionBatchResult {
  selected: number;
  recognized: number;
  contextOnly: number;
  failed: number;
  skipped: boolean; // vision 模型未設定
  reason?: string;
}

interface QueueRow {
  id: string;
  file_name: string;
  captured_at: string | null;
  vision_status: string | null;
  retry_count: number | null;
}

async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}

// 每張照片取第一個媒體資產（JPEG 或第一張 Key Frame）
async function firstAssetUrl(photoId: string): Promise<string | null> {
  const { data } = await supabase
    .from("costco_photo_media_assets")
    .select("storage_bucket, storage_path, asset_type, frame_number")
    .eq("photo_id", photoId)
    .order("asset_type", { ascending: false }) // JPEG 優先於 KEY_FRAME
    .order("frame_number", { ascending: true })
    .limit(1);
  const asset = data && data[0];
  if (!asset) return null;
  return signedUrl(asset.storage_bucket, asset.storage_path);
}

export function isVisionConfigured(): boolean {
  return Boolean(
    (process.env.VISION_ENDPOINT && process.env.VISION_API_KEY) ||
    (process.env.ASTRA_ENDPOINT && process.env.ASTRA_API_KEY)
  );
}

export async function runVisionBatch(limit = 10): Promise<VisionBatchResult> {
  if (!isVisionConfigured()) {
    return { selected: 0, recognized: 0, contextOnly: 0, failed: 0, skipped: true, reason: "VISION_*（或 ASTRA_*）未設定" };
  }
  const { data: rows, error } = await supabase
    .from("costco_photo_processing_queue")
    .select("id, file_name, captured_at, vision_status, retry_count")
    .eq("conversion_status", "CONVERTED")
    .in("vision_status", ["PENDING", "FAILED"])
    .lt("retry_count", MAX_RETRIES)
    .order("captured_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 25)));
  if (error) throw new Error(`Queue 讀取失敗：${error.message}`);

  const result: VisionBatchResult = { selected: rows?.length || 0, recognized: 0, contextOnly: 0, failed: 0, skipped: false };
  for (const row of (rows || []) as Array<QueueRow>) {
    try {
      const url = await firstAssetUrl(row.id);
      if (!url) throw new Error("找不到可辨識的媒體檔");
      const vision = await visionOnImage(url, `${row.file_name}${row.captured_at ? `｜拍攝於 ${row.captured_at}` : ""}`);
      if (!vision) throw new Error("vision 模型未回傳有效結果");
      await storeCandidate(row, vision);
      if (vision.context_only) {
        result.contextOnly += 1;
        await supabase.from("costco_photo_processing_queue").update({
          vision_status: "CONTEXT_ONLY", error_message: null,
          processed_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).eq("id", row.id);
      } else {
        result.recognized += 1;
        await supabase.from("costco_photo_processing_queue").update({
          vision_status: "RECOGNIZED", error_message: null,
          processed_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).eq("id", row.id);
      }
    } catch (e) {
      result.failed += 1;
      const message = e instanceof Error ? e.message : "vision 失敗";
      await supabase.from("costco_photo_processing_queue").update({
        vision_status: "FAILED",
        error_message: message.slice(0, 1000),
        retry_count: (row.retry_count || 0) + 1,
        updated_at: new Date().toISOString()
      }).eq("id", row.id);
    }
  }
  return result;
}

async function storeCandidate(row: QueueRow, vision: VisionResult): Promise<void> {
  const { data: asset } = await supabase
    .from("costco_photo_media_assets")
    .select("id")
    .eq("photo_id", row.id)
    .order("asset_type", { ascending: false })
    .order("frame_number", { ascending: true })
    .limit(1);
  await supabase.from("costco_vision_candidates").insert({
    photo_id: row.id,
    asset_id: asset && asset[0] ? asset[0].id : null,
    model: "vision",
    raw_result: vision as unknown as Record<string, unknown>,
    product_name: vision.product_name ?? null,
    brand: vision.brand ?? null,
    costco_item_number: vision.costco_item_number ?? null,
    jan: vision.jan ?? null,
    package_quantity: vision.package_quantity ?? null,
    package_unit: vision.package_unit ?? null,
    observed_price_jpy: vision.observed_price_jpy ?? null,
    regular_price_jpy: vision.regular_price_jpy ?? null,
    sale_price_jpy: vision.sale_price_jpy ?? null,
    sale_evidence: vision.sale_evidence ?? null,
    sale_end_date: vision.sale_end_date ?? null,
    confidence: vision.confidence ?? null,
    status: "CANDIDATE"
  });
}

export interface PairingBatchResult {
  productsConsidered: number;
  tagsConsidered: number;
  proposals: number;
  pairedPhotos: number;
}

// 配對：對「已辨識且待配對」的照片，依候選內容產生一對一配對建議。
export async function runPairingBatch(): Promise<PairingBatchResult> {
  const { data: rows, error } = await supabase
    .from("costco_photo_processing_queue")
    .select("id, file_name, captured_at, pairing_status")
    .eq("vision_status", "RECOGNIZED")
    .in("pairing_status", ["PENDING", "FAILED"])
    .limit(200);
  if (error) throw new Error(`配對 Queue 讀取失敗：${error.message}`);

  const photoIds = (rows || []).map((r) => r.id);
  if (!photoIds.length) return { productsConsidered: 0, tagsConsidered: 0, proposals: 0, pairedPhotos: 0 };

  const { data: candidates, error: candError } = await supabase
    .from("costco_vision_candidates")
    .select("photo_id, product_name, brand, costco_item_number, jan, package_quantity, package_unit, observed_price_jpy, regular_price_jpy, sale_price_jpy")
    .in("photo_id", photoIds)
    .order("created_at", { ascending: false });
  if (candError) throw new Error(`候選讀取失敗：${candError.message}`);

  const latestByPhoto = new Map<string, Record<string, unknown>>();
  for (const c of candidates || []) {
    if (!latestByPhoto.has((c as { photo_id: string }).photo_id)) latestByPhoto.set((c as { photo_id: string }).photo_id, c as Record<string, unknown>);
  }
  const rowById = new Map((rows || []).map((r) => [r.id, r]));
  const products: Array<PairCandidate & { row: QueueRow }> = [];
  const tags: Array<PairCandidate & { row: QueueRow }> = [];
  for (const [photoId, c] of latestByPhoto) {
    const row = rowById.get(photoId);
    if (!row) continue;
    const cand: PairCandidate = {
      photoId,
      fileName: row.file_name,
      capturedAt: row.captured_at,
      productName: (c.product_name as string) ?? null,
      brand: (c.brand as string) ?? null,
      costcoItemNumber: (c.costco_item_number as string) ?? null,
      jan: (c.jan as string) ?? null,
      packageQuantity: (c.package_quantity as number) ?? null,
      packageUnit: (c.package_unit as string) ?? null,
      observedPrice: (c.observed_price_jpy as number) ?? (c.sale_price_jpy as number) ?? null,
      isPriceTag: Boolean(
        ((c.observed_price_jpy ?? c.sale_price_jpy ?? c.regular_price_jpy) != null) &&
        !(c.product_name && String(c.product_name).length >= 4)
      )
    };
    (cand.isPriceTag ? tags : products).push(cand as never);
  }

  const proposals: PairingProposal[] = pairCandidates(products, tags);
  const pairedPhotoIds = new Set<string>();
  for (const p of proposals) {
    const { error: insertError } = await supabase.from("costco_photo_pairings").upsert({
      product_photo_id: p.productPhotoId,
      price_tag_photo_id: p.priceTagPhotoId,
      method: p.method,
      score: p.score,
      evidence: { evidence: p.evidence },
      status: "NEEDS_REVIEW"
    }, { onConflict: "product_photo_id,price_tag_photo_id" });
    if (insertError) continue;
    pairedPhotoIds.add(p.productPhotoId);
    pairedPhotoIds.add(p.priceTagPhotoId);
  }

  // 更新每張照片的配對狀態
  for (const photoId of photoIds) {
    const status = pairedPhotoIds.has(photoId) ? "PAIRED_CANDIDATE" : "UNPAIRED";
    await supabase.from("costco_photo_processing_queue").update({
      pairing_status: status, updated_at: new Date().toISOString()
    }).eq("id", photoId);
  }

  return {
    productsConsidered: products.length,
    tagsConsidered: tags.length,
    proposals: proposals.length,
    pairedPhotos: pairedPhotoIds.size
  };
}