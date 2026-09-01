import { supabase } from "@/lib/supabase";

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
  return (data || []) as WeeklyStoreDealRow[];
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
