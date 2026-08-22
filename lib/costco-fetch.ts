// 日本 Costco 商品抓取模組。
// 官方未提供公開 JSON API，此處以 HTML 解析為主，並保留證據來源。
// 若被反爬阻擋，會回傳空陣列並記錄錯誤，不會覆蓋上一期已發布商品。
import type { RawProduct } from "./search";

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
  // 去重（依 id），並優先保留較強的證據類型：hot_buy > new > page
  const rank = { official_hot_buy: 3, official_new: 2, official_page: 1 };
  const byId = new Map<string, RawProduct>();
  for (const p of results) {
    const prev = byId.get(p.id);
    if (!prev || (rank[p.evidenceType as keyof typeof rank] ?? 0) > (rank[prev.evidenceType as keyof typeof rank] ?? 0)) {
      byId.set(p.id, p);
    }
  }
  return [...byId.values()];
}
