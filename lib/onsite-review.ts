// 後台審核讀取：待審配對（NEEDS_REVIEW）與特價草稿（weekly_store_deals draft）。
// 照片一律以私有 bucket 路徑轉 signed URL 顯示，回看原圖確認後才能 VERIFIED。
import { supabase } from "@/lib/supabase";
import { resolvePhotoUrl } from "@/lib/onsite-deals";

export interface PairingCandidateInfo {
  productName: string | null;
  costcoItemNumber: string | null;
  jan: string | null;
  observedPriceJpy: number | null;
  salePriceJpy: number | null;
  regularPriceJpy: number | null;
  saleEvidence: string | null;
  saleEndDate: string | null;
  confidence: number | null;
  status: string | null;
}

export interface PairingReviewRow {
  id: number;
  status: string;
  method: string;
  score: number | null;
  evidence: string[];
  productPhoto: {
    id: string;
    fileName: string;
    url: string | null;
    candidate: PairingCandidateInfo | null;
  } | null;
  tagPhoto: {
    id: string;
    fileName: string;
    url: string | null;
    candidate: PairingCandidateInfo | null;
  } | null;
  updatedAt: string;
}

function toCandidateInfo(c: Record<string, unknown> | undefined): PairingCandidateInfo | null {
  if (!c) return null;
  return {
    productName: (c.product_name as string) ?? null,
    costcoItemNumber: (c.costco_item_number as string) ?? null,
    jan: (c.jan as string) ?? null,
    observedPriceJpy: (c.observed_price_jpy as number) ?? null,
    salePriceJpy: (c.sale_price_jpy as number) ?? null,
    regularPriceJpy: (c.regular_price_jpy as number) ?? null,
    saleEvidence: (c.sale_evidence as string) ?? null,
    saleEndDate: (c.sale_end_date as string) ?? null,
    confidence: (c.confidence as number) ?? null,
    status: (c.status as string) ?? null
  };
}

export async function getPairingsForReview(limit = 30): Promise<PairingReviewRow[]> {
  const { data: pairings, error } = await supabase
    .from("costco_photo_pairings")
    .select("id, product_photo_id, price_tag_photo_id, method, score, evidence, status, updated_at")
    .in("status", ["NEEDS_REVIEW", "VERIFIED", "REJECTED"])
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`配對審核讀取失敗：${error.message}`);

  const photoIds = Array.from(new Set((pairings || []).flatMap((p) =>
    [p.product_photo_id, p.price_tag_photo_id].filter((v): v is string => Boolean(v))
  )));
  if (!photoIds.length) return [];

  const [queueRes, candRes, assetRes] = await Promise.all([
    supabase.from("costco_photo_processing_queue").select("id, file_name").in("id", photoIds),
    supabase
      .from("costco_vision_candidates")
      .select("photo_id, product_name, costco_item_number, jan, observed_price_jpy, sale_price_jpy, regular_price_jpy, sale_evidence, sale_end_date, confidence, status")
      .in("photo_id", photoIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("costco_photo_media_assets")
      .select("photo_id, storage_bucket, storage_path, asset_type, frame_number")
      .in("photo_id", photoIds)
      .order("asset_type", { ascending: false })
      .order("frame_number", { ascending: true })
  ]);
  if (queueRes.error) throw new Error(`Queue 讀取失敗：${queueRes.error.message}`);

  const fileNameById = new Map((queueRes.data || []).map((r) => [r.id as string, r.file_name as string]));
  const candByPhoto = new Map<string, PairingCandidateInfo>();
  for (const c of candRes.data || []) {
    const photoId = c.photo_id as string;
    if (!candByPhoto.has(photoId) || c.status === "VERIFIED") {
      candByPhoto.set(photoId, toCandidateInfo(c as Record<string, unknown>)!);
    }
  }
  const refByPhoto = new Map<string, string>();
  for (const a of assetRes.data || []) {
    const photoId = a.photo_id as string;
    if (!refByPhoto.has(photoId)) refByPhoto.set(photoId, `${a.storage_bucket}/${a.storage_path}`);
  }

  const rows = await Promise.all((pairings || []).map(async (p) => {
    const productPhotoId = p.product_photo_id as string;
    const tagPhotoId = p.price_tag_photo_id as string | null;
    const ev = p.evidence as { evidence?: string[] } | null;
    return {
      id: p.id as number,
      status: p.status as string,
      method: p.method as string,
      score: (p.score as number) ?? null,
      evidence: Array.isArray(ev?.evidence) ? ev!.evidence! : [],
      productPhoto: {
        id: productPhotoId,
        fileName: fileNameById.get(productPhotoId) ?? productPhotoId,
        url: await resolvePhotoUrl(refByPhoto.get(productPhotoId) ?? null),
        candidate: candByPhoto.get(productPhotoId) ?? null
      },
      tagPhoto: tagPhotoId ? {
        id: tagPhotoId,
        fileName: fileNameById.get(tagPhotoId) ?? tagPhotoId,
        url: await resolvePhotoUrl(refByPhoto.get(tagPhotoId) ?? null),
        candidate: candByPhoto.get(tagPhotoId) ?? null
      } : null,
      updatedAt: p.updated_at as string
    };
  }));
  return rows;
}

export interface DraftDealReviewRow {
  id: string;
  product_id: string | null;
  costco_item_number: string | null;
  product_name_ja: string;
  product_name_zh: string | null;
  primaryPhotoUrl: string | null;
  priceTagPhotoUrl: string | null;
  regular_price_jpy: number | null;
  sale_price_jpy: number | null;
  discount_jpy: number | null;
  package_quantity: number | null;
  package_unit: string | null;
  sale_start_date: string | null;
  sale_end_date: string | null;
  ai_description: string | null;
  ai_confidence: number | null;
  verification_status: string;
  updatedAt: string;
}

export async function getDraftDeals(limit = 30): Promise<DraftDealReviewRow[]> {
  const { data, error } = await supabase
    .from("weekly_store_deals")
    .select("id, product_id, costco_item_number, product_name_ja, product_name_zh, primary_photo_url, price_tag_photo_url, regular_price_jpy, sale_price_jpy, discount_jpy, package_quantity, package_unit, sale_start_date, sale_end_date, ai_description, ai_confidence, verification_status, updated_at")
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`特價草稿讀取失敗：${error.message}`);
  return Promise.all((data || []).map(async (d) => ({
    id: d.id as string,
    product_id: (d.product_id as string) ?? null,
    costco_item_number: (d.costco_item_number as string) ?? null,
    product_name_ja: d.product_name_ja as string,
    product_name_zh: (d.product_name_zh as string) ?? null,
    primaryPhotoUrl: await resolvePhotoUrl((d.primary_photo_url as string) ?? null),
    priceTagPhotoUrl: await resolvePhotoUrl((d.price_tag_photo_url as string) ?? null),
    regular_price_jpy: (d.regular_price_jpy as number) ?? null,
    sale_price_jpy: (d.sale_price_jpy as number) ?? null,
    discount_jpy: (d.discount_jpy as number) ?? null,
    package_quantity: (d.package_quantity as number) ?? null,
    package_unit: (d.package_unit as string) ?? null,
    sale_start_date: (d.sale_start_date as string) ?? null,
    sale_end_date: (d.sale_end_date as string) ?? null,
    ai_description: (d.ai_description as string) ?? null,
    ai_confidence: (d.ai_confidence as number) ?? null,
    verification_status: (d.verification_status as string) ?? "UNVERIFIED",
    updatedAt: d.updated_at as string
  })));
}