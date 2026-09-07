// VERIFIED 配對 → weekly_store_deals 特價草稿。
// 交接規則：人工確認配對（VERIFIED）後才進入此步驟；產出一律 status='draft'／
// verification_status='UNVERIFIED'，人工補中文譯名與確認發布後才會出現在購物網站。
// 單一價格不是特價證據：無 OFF／値引／期限等促銷文字時，特價欄位一律清空。
import { supabase } from "@/lib/supabase";

export const DEAL_ID_PREFIX = "onsite-";
export const MEDIA_BUCKET = "costco-onsite-media";

export interface DealCandidateData {
  product_name: string | null;
  brand: string | null;
  costco_item_number: string | null;
  jan: string | null;
  package_quantity: number | null;
  package_unit: string | null;
  observed_price_jpy: number | null;
  regular_price_jpy: number | null;
  sale_price_jpy: number | null;
  sale_evidence: string | null;
  sale_end_date: string | null;
  confidence: number | null;
}

export interface DealPhotoContext {
  photoId: string;
  fileName: string;
  capturedAt: string | Date | null;
  // 私有 bucket 參照（"<bucket>/<path>"）；讀取端轉 signed URL，不存會過期的網址
  storageRef: string | null;
  productId: string | null;
  candidate: Partial<DealCandidateData> | null;
}

export interface DraftDealRow {
  id: string;
  product_id: string | null;
  costco_item_number: string | null;
  product_name_ja: string;
  product_name_zh: string | null;
  primary_photo_url: string | null;
  price_tag_photo_url: string | null;
  regular_price_jpy: number | null;
  sale_price_jpy: number | null;
  discount_jpy: number | null;
  package_quantity: number | null;
  package_unit: string | null;
  unit_price: number | null;
  unit_price_label: string | null;
  sale_start_date: string | null;
  sale_end_date: string | null;
  captured_at: string | null;
  ai_description: string;
  ai_confidence: number | null;
  verification_status: "UNVERIFIED";
  status: "draft";
}

function pick<T>(...vals: Array<T | null | undefined>): T | null {
  for (const v of vals) {
    if (v != null && v !== "") return v;
  }
  return null;
}

function toDateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function dealIdFor(productPhotoId: string): string {
  return `${DEAL_ID_PREFIX}${productPhotoId}`;
}

// 純函式：商品照 + 價牌照情境 → 特價草稿列（可測試）
export function mergePairingToDeal(product: DealPhotoContext, tag: DealPhotoContext | null): DraftDealRow {
  const pc = product.candidate ?? {};
  const tc = tag?.candidate ?? {};
  // 價牌照上的價格最可靠；無價牌照時退回商品照候選
  const observed = pick(tc.observed_price_jpy, pc.observed_price_jpy);
  const saleEvidence = pick(tc.sale_evidence, pc.sale_evidence);
  const salePrice = saleEvidence ? pick(tc.sale_price_jpy, pc.sale_price_jpy) : null;
  const regularPrice = pick(tc.regular_price_jpy, pc.regular_price_jpy) ?? observed;
  const discount = salePrice != null && regularPrice != null && regularPrice > salePrice
    ? regularPrice - salePrice
    : null;
  const packageQuantity = pick(pc.package_quantity, tc.package_quantity);
  const packageUnit = pick(pc.package_unit, tc.package_unit);
  const basePrice = salePrice ?? observed;
  const unitPrice = packageQuantity != null && packageQuantity > 0 && basePrice != null
    ? Math.round((basePrice / packageQuantity) * 10) / 10
    : null;
  const confidences = [pc.confidence, tc.confidence].filter((v): v is number => typeof v === "number");
  const capturedAt = toDateOnly(tag?.capturedAt ?? product.capturedAt);
  const productName = pick(pc.product_name, tc.product_name)
    ?? product.fileName.replace(/\.[a-z0-9]+$/i, "");
  const evidenceParts = [
    tag ? `商品照「${product.fileName}」↔ 價牌照「${tag.fileName}」` : `商品照「${product.fileName}」（無價牌照）`
  ];
  if (saleEvidence) evidenceParts.push(`特價證據：${saleEvidence}`);
  else evidenceParts.push("無促銷文字證據（僅記錄現場價格）");

  return {
    id: dealIdFor(product.photoId),
    product_id: product.productId ?? null,
    costco_item_number: pick(pc.costco_item_number, tc.costco_item_number),
    product_name_ja: productName,
    product_name_zh: null, // 中文譯名由人工補上後才可發布
    primary_photo_url: product.storageRef,
    price_tag_photo_url: tag?.storageRef ?? null,
    regular_price_jpy: regularPrice,
    sale_price_jpy: salePrice,
    discount_jpy: discount,
    package_quantity: packageQuantity,
    package_unit: packageUnit,
    unit_price: unitPrice,
    unit_price_label: unitPrice != null ? `約 ¥${Math.round(unitPrice)}${packageUnit ? `/${packageUnit}` : ""}` : null,
    sale_start_date: capturedAt, // 拍攝日＝特價觀察日（推測值，人工確認）
    sale_end_date: saleEvidence ? pick(tc.sale_end_date, pc.sale_end_date) : null,
    captured_at: product.capturedAt ? new Date(product.capturedAt).toISOString() : null,
    ai_description: `現場照片配對：${evidenceParts.join("；")}。全部欄位待人工確認。`,
    ai_confidence: confidences.length ? Math.min(...confidences) : null,
    verification_status: "UNVERIFIED",
    status: "draft"
  };
}

export interface DealBuildResult {
  pairingsConsidered: number;
  dealsCreated: number;
  dealsUpdated: number;
  observationsWritten: number;
  skippedAlreadyLinked: number;
  skippedPublished: number;
  skippedMissingPhoto: number;
}

export interface PriceObservationRow {
  id: string;
  product_id: string | null;
  deal_id: string;
  photo_id: string;
  observed_price: number | null;
  regular_price: number | null;
  discount_amount: number | null;
  sale_start_date: string | null;
  sale_end_date: string | null;
  observed_at: string | null;
  confidence: number | null;
  verified: boolean;
}

// 價格觀察列：以價牌照（無則商品照）為鍵，冪等；無任何價格時回傳 null
export function buildObservationFromDeal(
  product: DealPhotoContext,
  tag: DealPhotoContext | null,
  deal: DraftDealRow
): PriceObservationRow | null {
  const tc = tag?.candidate ?? {};
  const pc = product.candidate ?? {};
  const observedPrice = deal.sale_price_jpy
    ?? pick(tc.observed_price_jpy, pc.observed_price_jpy, tc.sale_price_jpy, pc.sale_price_jpy);
  if (observedPrice == null) return null;
  const photoId = tag?.photoId ?? product.photoId;
  const capturedAt = tag?.capturedAt ?? product.capturedAt;
  return {
    id: `obs-${photoId}`,
    product_id: deal.product_id,
    deal_id: deal.id,
    photo_id: photoId,
    observed_price: observedPrice,
    regular_price: deal.regular_price_jpy,
    discount_amount: deal.discount_jpy,
    sale_start_date: deal.sale_start_date,
    sale_end_date: deal.sale_end_date,
    observed_at: capturedAt ? new Date(capturedAt).toISOString() : null,
    confidence: deal.ai_confidence,
    verified: false
  };
}

// 對已人工確認（VERIFIED）的配對批次產生／更新特價草稿。
// 已連結 deal 的商品照不重複處理；已發布的 deal 不覆蓋。
export async function buildDealsFromVerifiedPairings(limit = 50): Promise<DealBuildResult> {
  const result: DealBuildResult = {
    pairingsConsidered: 0, dealsCreated: 0, dealsUpdated: 0, observationsWritten: 0,
    skippedAlreadyLinked: 0, skippedPublished: 0, skippedMissingPhoto: 0
  };
  const { data: pairings, error } = await supabase
    .from("costco_photo_pairings")
    .select("id, product_photo_id, price_tag_photo_id")
    .eq("status", "VERIFIED")
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw new Error(`配對讀取失敗：${error.message}`);
  if (!pairings?.length) return result;

  const photoIds = Array.from(new Set(pairings.flatMap((p) =>
    [p.product_photo_id, p.price_tag_photo_id].filter((v): v is string => Boolean(v))
  )));

  const { data: queueRows, error: queueError } = await supabase
    .from("costco_photo_processing_queue")
    .select("id, file_name, captured_at, deal_id, product_id")
    .in("id", photoIds);
  if (queueError) throw new Error(`Queue 讀取失敗：${queueError.message}`);
  const queueById = new Map((queueRows || []).map((r) => [r.id as string, r]));

  // 每張照片取第一個媒體資產路徑（JPEG 優先於 Key Frame）
  const { data: assets } = await supabase
    .from("costco_photo_media_assets")
    .select("photo_id, storage_bucket, storage_path, asset_type, frame_number")
    .in("photo_id", photoIds)
    .order("asset_type", { ascending: false })
    .order("frame_number", { ascending: true });
  const assetRefByPhoto = new Map<string, string>();
  for (const a of assets || []) {
    const photoId = a.photo_id as string;
    if (!assetRefByPhoto.has(photoId)) {
      assetRefByPhoto.set(photoId, `${a.storage_bucket}/${a.storage_path}`);
    }
  }

  // 每張照片取最新候選；優先採用已 VERIFIED 的辨識結果
  const { data: candidates, error: candError } = await supabase
    .from("costco_vision_candidates")
    .select("photo_id, product_name, brand, costco_item_number, jan, package_quantity, package_unit, observed_price_jpy, regular_price_jpy, sale_price_jpy, sale_evidence, sale_end_date, confidence, status")
    .in("photo_id", photoIds)
    .order("created_at", { ascending: false });
  if (candError) throw new Error(`候選讀取失敗：${candError.message}`);
  const candidateByPhoto = new Map<string, Partial<DealCandidateData>>();
  for (const c of candidates || []) {
    const photoId = c.photo_id as string;
    if (!candidateByPhoto.has(photoId) || c.status === "VERIFIED") {
      candidateByPhoto.set(photoId, c as Partial<DealCandidateData>);
    }
  }

  const toContext = (photoId: string): DealPhotoContext | null => {
    const row = queueById.get(photoId);
    if (!row) return null;
    return {
      photoId,
      fileName: row.file_name as string,
      capturedAt: (row.captured_at as string | null) ?? null,
      storageRef: assetRefByPhoto.get(photoId) ?? null,
      productId: (row.product_id as string | null) ?? null,
      candidate: candidateByPhoto.get(photoId) ?? null
    };
  };

  // Product Master 連結：以 JAN 精確比對 products（找不到就留空，人工處理）
  const janValues = Array.from(new Set(
    photoIds.flatMap((photoId) => {
      const jan = candidateByPhoto.get(photoId)?.jan;
      return jan ? [String(jan).trim()] : [];
    })
  ));
  const productIdByJan = new Map<string, string>();
  if (janValues.length) {
    const { data: matched, error: matchError } = await supabase
      .from("products")
      .select("id, jan_code")
      .in("jan_code", janValues);
    if (matchError) throw new Error(`Product Master 比對失敗：${matchError.message}`);
    for (const p of matched || []) {
      if (p.jan_code) productIdByJan.set(String(p.jan_code).trim(), p.id as string);
    }
  }

  for (const pairing of pairings) {
    result.pairingsConsidered += 1;
    const productCtx = toContext(pairing.product_photo_id);
    if (!productCtx) { result.skippedMissingPhoto += 1; continue; }
    if (productCtx.photoId && queueById.get(productCtx.photoId)?.deal_id) {
      result.skippedAlreadyLinked += 1;
      continue;
    }
    const tagCtx = pairing.price_tag_photo_id ? toContext(pairing.price_tag_photo_id) : null;
    // Product Master 連結：JAN 比對到既有商品時補 product_id
    if (!productCtx.productId) {
      const jan = pick(productCtx.candidate?.jan, tagCtx?.candidate?.jan);
      const matchedProductId = jan ? productIdByJan.get(String(jan).trim()) : null;
      if (matchedProductId) {
        productCtx.productId = matchedProductId;
        await supabase
          .from("costco_photo_processing_queue")
          .update({ product_id: matchedProductId, updated_at: new Date().toISOString() })
          .eq("id", productCtx.photoId);
      }
    }
    const draft = mergePairingToDeal(productCtx, tagCtx);

    const { data: existing } = await supabase
      .from("weekly_store_deals")
      .select("id, status")
      .eq("id", draft.id)
      .maybeSingle();
    if (existing?.status === "published") { result.skippedPublished += 1; continue; }

    const { error: upsertError } = await supabase
      .from("weekly_store_deals")
      .upsert(draft, { onConflict: "id" });
    if (upsertError) throw new Error(`特價草稿寫入失敗：${upsertError.message}`);
    if (existing) result.dealsUpdated += 1; else result.dealsCreated += 1;

    const linkedIds = [productCtx.photoId, tagCtx?.photoId].filter((v): v is string => Boolean(v));
    const { error: linkError } = await supabase
      .from("costco_photo_processing_queue")
      .update({ deal_id: draft.id, updated_at: new Date().toISOString() })
      .in("id", linkedIds);
    if (linkError) throw new Error(`照片 deal 連結失敗：${linkError.message}`);

    // 價格觀察：每組配對一筆（以價牌照為鍵），無任何價格則略過
    const observation = buildObservationFromDeal(productCtx, tagCtx, draft);
    if (observation) {
      const { error: obsError } = await supabase
        .from("costco_price_observations")
        .upsert(observation, { onConflict: "id" });
      if (obsError) throw new Error(`價格觀察寫入失敗：${obsError.message}`);
      result.observationsWritten += 1;
    }
  }
  return result;
}