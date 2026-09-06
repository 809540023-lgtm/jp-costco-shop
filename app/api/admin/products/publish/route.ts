import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { publishCollection } from "@/lib/publish";

// 2.0 既有發布入口：行為不變，核心邏輯抽至 lib/publish.ts 供 Agent 5 排程發布共用。
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids: string[] = rawIds.map((x: unknown) => String(x));
  if (!ids.length) return NextResponse.json({ error: "未選擇商品" }, { status: 400 });

  const { collectionId } = await publishCollection(ids);
  return NextResponse.json({ ok: true, collectionId });
}
