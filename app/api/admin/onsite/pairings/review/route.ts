import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { audit, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["VERIFIED", "REJECTED", "NEEDS_REVIEW"]);

// 配對人工審核：回看原圖後標記 VERIFIED／REJECTED。
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const status = String(body.status || "");
    if (!Number.isFinite(id) || !ALLOWED.has(status)) {
      return NextResponse.json({ error: "缺少配對 id 或狀態不正確" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("costco_photo_pairings")
      .update({ status, reviewed_by: "admin", reviewed_at: now, updated_at: now })
      .eq("id", id);
    if (error) throw new Error(`配對狀態更新失敗：${error.message}`);
    await audit("admin", `pairing_${status.toLowerCase()}`, "costco_photo_pairings", String(id));
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "配對審核失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}