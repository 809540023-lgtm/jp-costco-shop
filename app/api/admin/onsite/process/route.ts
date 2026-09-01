import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { processPendingCostcoMedia } from "@/lib/media-processing";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const limit = typeof body.limit === "number" ? body.limit : 10;
    return NextResponse.json(await processPendingCostcoMedia(limit));
  } catch (error) {
    const message = error instanceof Error ? error.message : "媒體處理失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
