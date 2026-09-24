import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { audit, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 可由人工編輯的草稿欄位（白名單，避免覆蓋審核與連結欄位）
const EDITABLE_FIELDS = [
  "product_name_zh", "costco_item_number",
  "regular_price_jpy", "sale_price_jpy", "discount_jpy",
  "package_quantity", "package_unit",
  "sale_start_date", "sale_end_date",
  "store_name", "store_location"
] as const;

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 特價草稿人工編輯；publish=true 時需有中文譯名才可發布。
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "缺少特價 id" }, { status: 400 });

    const { data: existing } = await supabase
      .from("weekly_store_deals")
      .select("id, status, product_name_zh")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "找不到特價資料" }, { status: 404 });
    if (existing.status === "published") {
      return NextResponse.json({ error: "已發布的特價不可再修改" }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field];
      if (["product_name_zh", "costco_item_number", "package_unit", "store_name", "store_location"].includes(field)) {
        patch[field] = raw == null ? null : String(raw).trim() || null;
      } else {
        patch[field] = toNumberOrNull(raw);
      }
    }

    const publish = body.publish === true;
    const zhName = String(patch.product_name_zh ?? existing.product_name_zh ?? "").trim();
    if (publish) {
      if (!zhName) return NextResponse.json({ error: "發布前需補中文譯名" }, { status: 400 });
      patch.status = "published";
      patch.verification_status = "VERIFIED";
      patch.published_at = new Date().toISOString();
    } else {
      patch.verification_status = zhName ? "VERIFIED" : "UNVERIFIED";
    }

    const { error } = await supabase.from("weekly_store_deals").update(patch).eq("id", id);
    if (error) throw new Error(`特價更新失敗：${error.message}`);
    await audit("admin", publish ? "deal_published" : "deal_updated", "weekly_store_deals", id);
    return NextResponse.json({ ok: true, published: publish });
  } catch (error) {
    const message = error instanceof Error ? error.message : "特價更新失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}