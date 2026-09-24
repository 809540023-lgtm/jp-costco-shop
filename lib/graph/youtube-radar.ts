// Agent 1 資料源：YouTube 代購影片雷達（YouTube Data API v3，官方 API）。
// 無 YOUTUBE_API_KEY 時優雅跳過，不阻塞主流程（SPEC 14.1：降級不阻塞）。
import { supabase } from "@/lib/supabase";
import { callLlm } from "./llm";
import { CommentItem } from "./intent-ingest";

export type { CommentItem } from "./intent-ingest";

const API_BASE = "https://www.googleapis.com/youtube/v3";

export interface RadarVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  url: string;
}

export const DEFAULT_SEARCH_QUERIES = ["日本 Costco 代購", "日本好市多 必買", "日本 Costco 開箱"];

function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, "");
}

// 標題/說明與 product_entity 關鍵字比對（規則層；跨來源實體比對的精確合併交給 Astra 批次）
export async function matchEntityByTitle(title: string, description: string): Promise<string | null> {
  const { data: entities } = await supabase
    .from("product_entity")
    .select("id, canonical_name, canonical_name_jp, brand, keywords")
    .neq("status", "rejected")
    .limit(500);
  const haystack = normalize(`${title} ${description}`);
  for (const e of entities || []) {
    const keys = [e.canonical_name, e.canonical_name_jp, ...(e.keywords || [])].filter(Boolean).map(normalize);
    if (keys.some((k) => k.length >= 4 && haystack.includes(k))) return e.id;
  }
  return null;
}

export async function searchResellerVideos(queries: string[] = DEFAULT_SEARCH_QUERIES): Promise<RadarVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const out = new Map<string, RadarVideo>();
  for (const q of queries) {
    try {
      const searchUrl = new URL(`${API_BASE}/search`);
      searchUrl.searchParams.set("key", key);
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("q", q);
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("order", "date");
      searchUrl.searchParams.set("publishedAfter", new Date(Date.now() - 7 * 86400_000).toISOString());
      searchUrl.searchParams.set("maxResults", "25");
      searchUrl.searchParams.set("relevanceLanguage", "zh-TW");
      const searchRes = await fetch(searchUrl, { cache: "no-store" });
      if (!searchRes.ok) continue;
      const searchPayload = (await searchRes.json()) as {
        items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; description?: string } }>;
      };
      const videoIds = (searchPayload.items || []).map((i) => i.id?.videoId).filter(Boolean).join(",");
      if (!videoIds) continue;

      const statsUrl = new URL(`${API_BASE}/videos`);
      statsUrl.searchParams.set("key", key);
      statsUrl.searchParams.set("part", "statistics,snippet");
      statsUrl.searchParams.set("id", videoIds);
      const statsRes = await fetch(statsUrl, { cache: "no-store" });
      if (!statsRes.ok) continue;
      const statsPayload = (await statsRes.json()) as {
        items?: Array<{
          id: string;
          snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; description?: string };
          statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
        }>;
      };
      for (const v of statsPayload.items || []) {
        if (!v.id || out.has(v.id)) continue;
        out.set(v.id, {
          videoId: v.id,
          title: v.snippet?.title || "",
          channelTitle: v.snippet?.channelTitle || "",
          channelId: v.snippet?.channelId || "",
          publishedAt: v.snippet?.publishedAt || new Date().toISOString(),
          views: Number(v.statistics?.viewCount || 0),
          likes: Number(v.statistics?.likeCount || 0),
          comments: Number(v.statistics?.commentCount || 0),
          url: `https://www.youtube.com/watch?v=${v.id}`
        });
      }
    } catch {
      // 單一查詢失敗不影響其他查詢
    }
  }
  return Array.from(out.values());
}

export interface RadarIngestResult {
  videosFetched: number;
  listingsCreated: number;
  mentionsCreated: number;
  entitiesMatched: number;
  matchedListings: Array<{ listingId: string; videoId: string; productId: string }>;
}

// 將雷達結果寫入 Graph：source_listing + reseller_mention。
// 影片標題視為「該代購推廣了標題中的商品」；無法配對的商品實體先留 listing，待 Astra 批次比對。
export async function ingestRadarVideos(videos: RadarVideo[]): Promise<RadarIngestResult> {
  const result: RadarIngestResult = { videosFetched: videos.length, listingsCreated: 0, mentionsCreated: 0, entitiesMatched: 0, matchedListings: [] };
  for (const v of videos) {
    const dedupHash = `youtube:${v.videoId}`;
    const { data: existing } = await supabase
      .from("source_listing")
      .select("id")
      .eq("dedup_hash", dedupHash)
      .maybeSingle();
    if (existing) continue;

    const entityId = await matchEntityByTitle(v.title, v.title);
    const { data: listing, error } = await supabase
      .from("source_listing")
      .insert({
        product_id: entityId,
        source_type: "reseller_video",
        external_id: v.videoId,
        url: v.url,
        title: v.title,
        author: v.channelTitle,
        author_key: `youtube:${v.channelId}`,
        published_at: v.publishedAt,
        raw_payload: { views: v.views, likes: v.likes, comments: v.comments },
        dedup_hash: dedupHash
      })
      .select("id")
      .maybeSingle();
    if (error || !listing) continue;
    result.listingsCreated += 1;

    if (entityId) {
      result.entitiesMatched += 1;
      result.matchedListings.push({ listingId: listing.id, videoId: v.videoId, productId: entityId });
      const { data: prior } = await supabase
        .from("reseller_mention")
        .select("id")
        .eq("product_id", entityId)
        .eq("reseller_key", `youtube:${v.channelId}`)
        .limit(1);
      const { error: mentionError } = await supabase.from("reseller_mention").insert({
        product_id: entityId,
        source_listing_id: listing.id,
        reseller_key: `youtube:${v.channelId}`,
        platform: "youtube",
        is_first_mention: !prior || prior.length === 0,
        engagement: { views: v.views, likes: v.likes, comments: v.comments },
        mentioned_at: v.publishedAt
      });
      if (!mentionError) result.mentionsCreated += 1;
    }
  }
  return result;
}

// 抓影片留言內容（commentThreads，每影片最多 100 則），供 Agent 2 規則分類。
export async function fetchVideoComments(videoId: string): Promise<CommentItem[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  try {
    const url = new URL(`${API_BASE}/commentThreads`);
    url.searchParams.set("key", key);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("videoId", videoId);
    url.searchParams.set("order", "relevance");
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("textFormat", "plainText");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const payload = (await res.json()) as {
      items?: Array<{
        id?: string;
        snippet?: {
          topLevelComment?: {
            id?: string;
            snippet?: { textDisplay?: string; textOriginal?: string; authorDisplayName?: string; publishedAt?: string; likeCount?: number };
          };
        };
      }>;
    };
    return (payload.items || [])
      .map((i) => ({
        commentId: i.id || i.snippet?.topLevelComment?.id || "",
        videoId,
        text: i.snippet?.topLevelComment?.snippet?.textOriginal || i.snippet?.topLevelComment?.snippet?.textDisplay || "",
        author: i.snippet?.topLevelComment?.snippet?.authorDisplayName,
        publishedAt: i.snippet?.topLevelComment?.snippet?.publishedAt,
        likes: i.snippet?.topLevelComment?.snippet?.likeCount
      }))
      .filter((c) => c.commentId && c.text);
  } catch {
    return []; // 單一影片留言抓取失敗不影響其他影片
  }
}

// 模糊標題的實體比對交給 Astra 批次（每天一次）；金鑰未設定時回 null。
export async function astraEntityMatch(sample: { title: string; candidates: Array<{ id: string; canonical_name: string }> }) {
  const prompt = `判斷影片標題所指的商品是否屬於任一候選商品。只輸出 JSON：{"match": <candidate id|null>}\n標題：${sample.title}\n候選：${JSON.stringify(sample.candidates)}`;
  const res = await callLlm("entity_matching", "你是跨來源商品實體比對助手。", prompt, { json: true });
  if (!res) return null;
  try {
    const parsed = JSON.parse(res.content) as { match?: string | null };
    return parsed.match ?? null;
  } catch {
    return null;
  }
}