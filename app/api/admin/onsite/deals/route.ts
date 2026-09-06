import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { buildDealsFromVerifiedPairings } from "@/lib/vision/deals";

export const dynamic = "force-dynamic";

// VERIFIED 配對 → weekly_store_deals 特價草稿（draft / UNVERIFIED，人工確認後發布）。
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const limit = typeof body.limit === "number" ? body.limit : 50;
    const result = await buildDealsFromVerifiedPairings(limit);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "特價草稿產生失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}