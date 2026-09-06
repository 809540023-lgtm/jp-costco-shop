import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { generateContentDrafts } from "@/lib/graph/content";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Agent 5 手動觸發自動文案（cron run-agents 也會每日執行同一函式）
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    const result = await generateContentDrafts({ limit: 50 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}