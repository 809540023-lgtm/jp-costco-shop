import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { runVisionBatch, runPairingBatch } from "@/lib/vision/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vision 批次：辨識 → 配對。全部產出 CANDIDATE / NEEDS_REVIEW（人工確認後發布）。
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const limit = typeof body.limit === "number" ? body.limit : 10;
    const vision = await runVisionBatch(limit);
    const pairing = vision.skipped
      ? { productsConsidered: 0, tagsConsidered: 0, proposals: 0, pairedPhotos: 0 }
      : await runPairingBatch();
    return NextResponse.json({ vision, pairing });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vision 處理失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}