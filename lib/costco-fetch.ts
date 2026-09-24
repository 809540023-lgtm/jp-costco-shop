// 日本 Costco 商品抓取模組。
// 主要來源：官方 REST API（lib/costco-api.ts，含價格／評分／評論數／圖片／官方標籤）。
// 備援來源：官方頁面 HTML 解析（只能取得商品連結，作為 API 被封鎖時的退路）。
// 若被反爬阻擋，會回傳空陣列並記錄錯誤，不會覆蓋上一期已發布商品。
import type { RawProduct } from "./search";
import { fetchOfficialProducts } from "./costco-api";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const SEED_URLS: { url: string; evidenceType: string }[] = [
  { url: "https://www.costco.co.jp/", evidenceType: "official_page" },
  { url: "https://www.costco.co.jp/c/WhatsNew", evidenceType: "official_new" }
];

// 從 HTML 中擷取商品頁連結。日本 Costco 商品頁網址格式：/.../p/<數字 id>
export function parseProducts(html: string, sourceUrl: string, evidenceType: string): RawProduct[] {
  const out: RawProduct[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href=["']([^"']*?\/p\/\d+[^"']*?)["'][^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const rawHref = m[1];
    const cleanHref = rawHref.replace(/&amp;/g, "&").split("?")[0];
    const idMatch = cleanHref.match(/\/p\/(\d+)/);
    if (!idMatch) continue;
    const productId = idMatch[1];
    const id = `jp-${productId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // 商品名由網址路徑推導：取 /p/ 前最後一個 slug 段
    const segments = cleanHref.split("/").filter(Boolean);
    const pIndex = segments.findIndex((s) => s === "p");
    const slug = pIndex > 0 ? segments[pIndex - 1] : undefined;
    const jpName = slug ? slug.replace(/-/g, " ") : `Costco 商品 ${productId}`;
    out.push({
      id,
      jpName,
      costcoUrl: new URL(cleanHref, sourceUrl).toString(),
      evidenceSource: sourceUrl,
      evidenceType
    });
  }
  return out;
}

export async function fetchCostcoJapan(): Promise<RawProduct[]> {
  return (await fetchCostcoJapanDetailed()).products;
}

export interface CostcoFetchResult {
  products: RawProduct[];
  sources: Array<{ name: string; ok: boolean; count: number; error?: string }>;
}

// API 優先（有價格／評分／評論數／圖片與官方標籤），HTML 解析作為備援。
// 全部來源都失敗時丟錯，讓 cron 標記失敗並保留上一期已發布商品（不可寫入空批次）。
export async function fetchCostcoJapanDetailed(): Promise<CostcoFetchResult> {
  const sources: CostcoFetchResult["sources"] = [];
  let products: RawProduct[] = [];

  try {
    const api = await fetchOfficialProducts();
    const failedAllPages = api.pagesFetched === 0;
    sources.push({
      name: "official_rest_api",
      ok: !failedAllPages,
      count: api.products.length,
      error: failedAllPages ? api.errors.join(" | ") || "沒有取得任何頁面" : undefined
    });
    if (!failedAllPages) products = api.products;
  } catch (e) {
    sources.push({ name: "official_rest_api", ok: false, count: 0, error: (e as Error).message });
  }

  if (!products.length) {
    const html = await fetchCostcoJapanHtml();
    sources.push({ name: "official_html", ok: html.products.length > 0, count: html.products.length, error: html.error });
    if (html.products.length) products = html.products;
  }

  if (!products.length && sources.every((s) => !s.ok)) {
    throw new Error(`所有商品來源皆失敗：${sources.map((s) => `${s.name}(${s.error ?? "未知錯誤"})`).join(" | ")}`);
  }
  return { products, sources };
}

async function fetchCostcoJapanHtml(): Promise<{ products: RawProduct[]; error?: string }> {
  const results: RawProduct[] = [];
  const errors: string[] = [];
  for (const { url, evidenceType } of SEED_URLS) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9" },
        signal: AbortSignal.timeout(20000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const parsed = parseProducts(html, url, evidenceType);
      results.push(...parsed);
      console.log(`[costco-fetch] ${url} → ${parsed.length} 筆`);
    } catch (e) {
      errors.push(`${url}: ${(e as Error).message}`);
    }
  }
  if (errors.length) {
    console.warn("[costco-fetch] 部分來源失敗:", errors.join(" | "));
  }
  // 去重（依 id），並優先保留較強的證據類型：official_rest_api > hot_buy > new > page
  const rank: Record<string, number> = {
    official_rest_api: 4,
    official_hot_buy: 3,
    official_new: 2,
    official_page: 1
  };
  const byId = new Map<string, RawProduct>();
  for (const p of results) {
    const prev = byId.get(p.id);
    if (!prev || (rank[p.evidenceType ?? ""] ?? 0) > (rank[prev.evidenceType ?? ""] ?? 0)) {
      byId.set(p.id, p);
    }
  }
  return { products: [...byId.values()], error: errors.length ? errors.join(" | ") : undefined };
}
