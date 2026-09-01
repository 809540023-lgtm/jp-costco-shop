import { db } from "@/lib/db";

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

export function getPublishedWeeklyDeals(): WeeklyStoreDealRow[] {
  return db.prepare(`
    SELECT id, costco_item_number, product_name_ja, product_name_zh,
      primary_photo_url, price_tag_photo_url, regular_price_jpy,
      sale_price_jpy, discount_jpy, package_quantity, package_unit,
      unit_price_label, sale_end_date, verification_status, status
    FROM weekly_store_deals
    WHERE status = 'published' AND verification_status = 'VERIFIED'
    ORDER BY COALESCE(published_at, created_at) DESC
  `).all() as unknown as WeeklyStoreDealRow[];
}

export function getPhotoQueueSummary() {
  const total = db.prepare("SELECT COUNT(*) AS n FROM costco_photo_processing_queue").get() as { n: number };
  const groups = db.prepare(`
    SELECT vision_status AS status, COUNT(*) AS n
    FROM costco_photo_processing_queue GROUP BY vision_status ORDER BY vision_status
  `).all() as unknown as Array<{ status: string; n: number }>;
  return { total: total.n, groups };
}
