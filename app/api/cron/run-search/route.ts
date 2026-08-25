import { NextResponse } from "next/server";
import { fetchCostcoJapan } from "@/lib/costco-fetch";
import { runDailySearch } from "@/lib/search";
import { notifyAdmin } from "@/lib/line";

export const dynamic = "force-dynamic";

// 每日排程入口：由 cron 於每天早上 08:00 呼叫。
// 需帶 CRON_SECRET（header: x-cron-secret 或 query: ?secret=）。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const raw = await fetchCostcoJapan();
    const { batchId, count } = await runDailySearch(raw);
    const summary = `搜尋批次 ${batchId} 完成，保留 ${count} 項日本特色商品。`;
    await notifyAdmin(summary);
    return NextResponse.json({ batchId, count, summary });
  } catch (e) {
    const msg = (e as Error).message || "搜尋失敗";
    await notifyAdmin(`每日搜尋失敗：${msg}（網站仍顯示上一期已發布商品）`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
