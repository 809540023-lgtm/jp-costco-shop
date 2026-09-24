// 驗收數字報告（交接文件規定：列出實際數字，不得使用模糊百分比）。
// 對應 docs/COSTCO_ONSITE_HANDOVER.md「驗收數字」段落。
import { supabase } from "@/lib/supabase";

export interface OnsiteAcceptanceReport {
  driveTotal: number;
  imageTotal: number;
  videoTotal: number;
  downloadCompleted: number;
  conversionCompleted: number;
  visionRecognized: number;
  contextOnly: number;
  visionFailed: number;
  visionPending: number;
  pairingsNeedsReview: number;
  pairingsVerified: number;
  pairingsRejected: number;
  uniqueProducts: number;
  pairedWithPrice: number;
  productOnlyNoPrice: number;
  regularPriceDeals: number;
  saleDeals: number;
  publishedDeals: number;
  draftDeals: number;
  // 檔案結算檢查：總數 = 成功辨識＋情境照＋失敗＋待處理
  ledgerBalanced: boolean;
  generatedAt: string;
}

export async function buildOnsiteAcceptanceReport(): Promise<OnsiteAcceptanceReport> {
  const [queueRes, pairingRes, dealRes] = await Promise.all([
    supabase
      .from("costco_photo_processing_queue")
      .select("id, mime_type, download_status, conversion_status, vision_status"),
    supabase.from("costco_photo_pairings").select("id, status, price_tag_photo_id"),
    supabase
      .from("weekly_store_deals")
      .select("id, status, costco_item_number, product_name_ja, sale_price_jpy, regular_price_jpy, discount_jpy")
  ]);

  if (queueRes.error) throw new Error(`Queue 統計失敗：${queueRes.error.message}`);
  if (pairingRes.error) throw new Error(`配對統計失敗：${pairingRes.error.message}`);
  if (dealRes.error) throw new Error(`特價統計失敗：${dealRes.error.message}`);

  const queue = queueRes.data || [];
  const pairings = (pairingRes.data || []) as Array<{ status: string; price_tag_photo_id: string | null }>;
  const deals = (dealRes.data || []) as Array<{
    status: string; costco_item_number: string | null; product_name_ja: string;
    sale_price_jpy: number | null; regular_price_jpy: number | null; discount_jpy: number | null;
  }>;

  const report: OnsiteAcceptanceReport = {
    driveTotal: queue.length,
    imageTotal: queue.filter((q) => q.mime_type?.startsWith("image/")).length,
    videoTotal: queue.filter((q) => q.mime_type?.startsWith("video/")).length,
    downloadCompleted: queue.filter((q) => q.download_status === "DOWNLOADED").length,
    conversionCompleted: queue.filter((q) => q.conversion_status === "CONVERTED").length,
    visionRecognized: queue.filter((q) => q.vision_status === "RECOGNIZED").length,
    contextOnly: queue.filter((q) => q.vision_status === "CONTEXT_ONLY").length,
    visionFailed: queue.filter((q) => q.vision_status === "FAILED").length,
    visionPending: queue.filter((q) => !q.vision_status || !["RECOGNIZED", "CONTEXT_ONLY", "FAILED"].includes(q.vision_status)).length,
    pairingsNeedsReview: pairings.filter((p) => p.status === "NEEDS_REVIEW").length,
    pairingsRejected: pairings.filter((p) => p.status === "REJECTED").length,
    pairingsVerified: pairings.filter((p) => p.status === "VERIFIED").length,
    uniqueProducts: 0,
    pairedWithPrice: 0,
    productOnlyNoPrice: 0,
    saleDeals: 0,
    regularPriceDeals: 0,
    publishedDeals: deals.filter((d) => d.status === "published").length,
    draftDeals: deals.filter((d) => d.status === "draft").length,
    ledgerBalanced: false,
    generatedAt: new Date().toISOString()
  };

  // 唯一商品：以 Item Number 優先、退回日文名的去重計數
  const identities = new Set<string>();
  for (const d of deals) {
    identities.add(d.costco_item_number || `name:${d.product_name_ja}`);
  }
  report.uniqueProducts = identities.size;

  // 特價分類：有折扣／特價價 → 限時特價；只有現場價 → 一般價格
  report.saleDeals = deals.filter((d) => d.sale_price_jpy != null && d.discount_jpy != null && d.discount_jpy > 0).length;
  report.regularPriceDeals = deals.filter((d) => d.sale_price_jpy == null && d.regular_price_jpy != null).length;

  // 配對分類：VERIFIED 配對中，有價牌照（含價格）＝商品價牌成功配對；無價牌照＝只有商品無價格
  report.pairedWithPrice = pairings.filter((p) => p.status === "VERIFIED" && p.price_tag_photo_id).length;
  report.productOnlyNoPrice = pairings.filter((p) => p.status === "VERIFIED" && !p.price_tag_photo_id).length;

  const settled =
    report.visionRecognized + report.contextOnly + report.visionFailed + report.visionPending;
  report.ledgerBalanced = settled === report.driveTotal;
  return report;
}

// 交接文件要求的結算恆等式：Drive 總數 = 成功辨識 + 情境照 + 無法辨識 + 待處理
export function ledgerLine(r: OnsiteAcceptanceReport): string {
  return `檔案結算：${r.driveTotal} = ${r.visionRecognized}（成功辨識）+ ${r.contextOnly}（情境照）+ ${r.visionFailed}（無法辨識）+ ${r.visionPending}（待處理）${r.ledgerBalanced ? " ✓" : " ✗ 不平衡"}`;
}