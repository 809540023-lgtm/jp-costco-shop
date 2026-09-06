import { NextResponse } from "next/server";
import { runDailyPipeline } from "@/lib/graph/pipeline";
import { generateContentDrafts } from "@/lib/graph/content";
import { searchResellerVideos, ingestRadarVideos, fetchVideoComments } from "@/lib/graph/youtube-radar";
import { ingestVideoIntents, CommentItem } from "@/lib/graph/intent-ingest";
import { isAstraConfigured, callLlm } from "@/lib/graph/llm";
import { AstraDecisionProvider, DecisionInput } from "@/lib/graph/decision";
import { buildPurchaseList } from "@/lib/graph/procurement";
import { notifyAdmin, notifyPurchaseList } from "@/lib/line";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 3.0 每日 Agent 管線入口（SPEC Phase 10–12）：雷達 → 評分 → 決策 → 快照。
// 需帶 CRON_SECRET（header: x-cron-secret 或 query: ?secret=）。
// Astra 僅在通過門檻的候選上使用；金鑰未設定時全程規則引擎，仍產出完整決策。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const radar = searchResellerVideos().then(async (videos) => {
      const youtube = await ingestRadarVideos(videos);
      // Agent 2：只對已比對到商品的影片抓留言 → 規則分類（模糊案例升級 AI）→ intent_signal
      const commentsByVideo = new Map<string, CommentItem[]>();
      for (const m of youtube.matchedListings) {
        const comments = await fetchVideoComments(m.videoId);
        if (comments.length) commentsByVideo.set(m.videoId, comments);
      }
      const intents = await ingestVideoIntents(youtube.matchedListings, commentsByVideo);
      return { youtube, intents };
    }).catch(() => ({
      youtube: { videosFetched: 0, listingsCreated: 0, mentionsCreated: 0, entitiesMatched: 0, matchedListings: [] as Array<{ listingId: string; videoId: string; productId: string }> },
      intents: { commentsConsidered: 0, signalsCreated: 0, aiUpgraded: 0 }
    }));

    const astra: AstraDecisionProvider | undefined = isAstraConfigured()
      ? async (entity: { id: string; canonicalName: string; brand: string | null }, input: DecisionInput) => {
          const res = await callLlm(
            "procurement_decision",
            "你是 AI 採購主管，綜合所有訊號判斷商品是否值得台灣代購上架。只輸出 JSON：{\"recommendation_score\":<0-100>,\"decision\":\"reject|observe|list|top50|weekly_pick|hot_candidate\",\"reasons\":[{\"factor\":\"\",\"level\":<1-5>,\"evidence\":\"\"}],\"comment\":\"一段話決策理由\"}",
            JSON.stringify({ entity, signals: input })
          );
          if (!res) return null;
          try {
            return JSON.parse(res.content);
          } catch {
            return null;
          }
        }
      : undefined;

    const results = await runDailyPipeline({ limit: 200, astra });
    // Agent 5：通過門檻的商品自動產生繁中內容草稿（無金鑰時模板產生，失敗不阻塞主管線）
    const drafts = await generateContentDrafts({ limit: 50 }).catch(() => ({ generated: 0, skippedExisting: 0, polished: 0 }));
    const radarResult = await radar;
    const counts = results.reduce((acc, r) => { acc[r.decision] = (acc[r.decision] || 0) + 1; return acc; }, {} as Record<string, number>);
    const summary = `3.0 管線完成：評分 ${results.length} 項，決策分布 ${JSON.stringify(counts)}，自動文案新增 ${drafts.generated} 筆草稿（潤稿 ${drafts.polished}），YouTube 雷達新增 ${radarResult.youtube.mentionsCreated} 筆提及、留言意圖 ${radarResult.intents.signalsCreated} 筆（AI 升級 ${radarResult.intents.aiUpgraded}）。`;
    await notifyAdmin(summary);
    // Agent 6：有待採購訂單時自動彙總採購清單並 LINE 通知（失敗不影響主管線）。
    try {
      const pl = await buildPurchaseList();
      if (pl.items.length) await notifyPurchaseList(pl);
    } catch { /* 採購清單通知失敗不影響主管線 */ }
    return NextResponse.json({ summary, counts, drafts, radar: radarResult, evaluated: results.length });
  } catch (e) {
    const msg = (e as Error).message || "3.0 管線失敗";
    await notifyAdmin(`3.0 管線失敗：${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}