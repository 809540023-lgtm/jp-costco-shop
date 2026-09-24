import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { publishDraftNow } from "@/lib/publish";

export const dynamic = "force-dynamic";

// Agent 5 草稿一鍵核准發布：由草稿建立 2.0 商品後沿用既有 publish 流程
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const draftId = String(body.draftId || "");
  if (!draftId) return NextResponse.json({ error: "缺少 draftId" }, { status: 400 });
  try {
    const result = await publishDraftNow(draftId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}