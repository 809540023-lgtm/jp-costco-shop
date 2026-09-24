import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isDraftDue, publishDraftNow } from "@/lib/publish";
import { notifyAdmin } from "@/lib/line";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Agent 5 排程發布 cron：把已核准且排程到期的草稿，沿用 2.0 publish 流程發布。
// 需帶 CRON_SECRET（header: x-cron-secret 或 query: ?secret=）。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const now = new Date();
    const { data: candidates, error } = await supabase.from("content_draft")
      .select("id, publish_status, scheduled_for")
      .eq("publish_status", "approved")
      .not("scheduled_for", "is", null)
      .lte("scheduled_for", now.toISOString())
      .limit(50);
    if (error) throw new Error(`排程草稿讀取失敗：${error.message}`);
    const due = (candidates || []).filter((d) => isDraftDue(d as { publish_status: string; scheduled_for: string | null }, now));

    let published = 0;
    const failures: Array<{ id: string; error: string }> = [];
    for (const d of due) {
      try {
        await publishDraftNow(d.id, now);
        published++;
      } catch (e) {
        failures.push({ id: d.id, error: (e as Error).message });
      }
    }
    if (due.length) {
      await notifyAdmin(`3.0 排程發布完成：發布 ${published} 筆草稿${failures.length ? `，失敗 ${failures.length} 筆` : ""}。`);
    }
    return NextResponse.json({ due: due.length, published, failures });
  } catch (e) {
    const msg = (e as Error).message || "排程發布失敗";
    await notifyAdmin(`3.0 排程發布失敗：${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}