import { supabase } from "@/lib/supabase";
import { MEDIA_BUCKET } from "@/lib/vision/deals";

// 私有 bucket 參照（"<bucket>/<path>"）轉 signed URL；已是 http(s) 的網址直接回傳
export async function resolvePhotoUrl(url: string | null, ttlSeconds = 600): Promise<string | null> {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  const prefix = `${MEDIA_BUCKET}/`;
  const path = url.startsWith(prefix) ? url.slice(prefix.length) : url;
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, ttlSeconds);
  return data?.signedUrl ?? null;
}

export interface WeeklyStoreDealRow {
  id: string;
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
  unit_price_label: string | null;
  sale_end_date: string | null;
  verification_status: string;
  status: string;
}

export async function getPublishedWeeklyDeals(): Promise<WeeklyStoreDealRow[]> {
  const { data, error } = await supabase
    .from("weekly_store_deals")
    .select(`id, costco_item_number, product_name_ja, product_name_zh,
      primary_photo_url, price_tag_photo_url, regular_price_jpy,
      sale_price_jpy, discount_jpy, package_quantity, package_unit,
      unit_price_label, sale_end_date, verification_status, status`)
    .eq("status", "published")
    .eq("verification_status", "VERIFIED")
    .order("published_at", { ascending: false });
  if (error) throw new Error(`現場商品讀取失敗：${error.message}`);
  const rows = (data || []) as WeeklyStoreDealRow[];
  return Promise.all(rows.map(async (row) => ({
    ...row,
    primary_photo_url: await resolvePhotoUrl(row.primary_photo_url),
    price_tag_photo_url: await resolvePhotoUrl(row.price_tag_photo_url)
  })));
}

export async function getPhotoQueueSummary() {
  const { data, error, count } = await supabase
    .from("costco_photo_processing_queue")
    .select("vision_status,mime_type", { count: "exact" });
  if (error) throw new Error(`相片 Queue 統計失敗：${error.message}`);

  const grouped = new Map<string, number>();
  let imageTotal = 0;
  let videoTotal = 0;
  for (const row of data || []) {
    const status = row.vision_status || "UNKNOWN";
    grouped.set(status, (grouped.get(status) || 0) + 1);
    if (row.mime_type?.startsWith("image/")) imageTotal += 1;
    if (row.mime_type?.startsWith("video/")) videoTotal += 1;
  }

  return {
    total: count || 0,
    groups: Array.from(grouped, ([status, n]) => ({ status, n })).sort((a, b) =>
      a.status.localeCompare(b.status)
    ),
    imageTotal,
    videoTotal
  };
}
