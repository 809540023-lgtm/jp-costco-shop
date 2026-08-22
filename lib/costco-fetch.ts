// 日本 Costco 商品抓取模組。
// 官方未提供公開 JSON API，此處以 HTML 解析為主，並保留證據來源。
// 若被反爬阻擋，會回傳空陣列並記錄錯誤，不會覆蓋上一期已發布商品。
import type { RawProduct } from "./search";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const SEED_URLS = [
  "https://www.costco.co.jp/",
  "https://www.costco.co.jp/Hot-Buys",
  "https://www.costco.co.jp/New-Items"
];

// 從 HTML 中粗略擷取商品連結與標題。
function parseProducts(html: string, sourceUrl: string): RawProduct[] {
  const out: RawProduct[] = [];
  const seen = new Set<string>();
  // 商品頁網址通常含 /Product/ 或 /product/ 或 .p 結尾
  const re = /<a[^>]+href=["']([^"']*?\/[Pp]roduct\/[^"']*?)["'][^>]*>(.*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!title || title.length < 2) continue;
    const id = `jp-${Buffer.from(href).toString("base64url").slice(0, 24)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      jpName: title,
      costcoUrl: new URL(href, sourceUrl).toString(),
      evidenceSource: sourceUrl,
      evidenceType: "official_page"
    });
  }
  return out;
}

export async function fetchCostcoJapan(): Promise<RawProduct[]> {
  const results: RawProduct[] = [];
  const errors: string[] = [];
  for (const url of SEED_URLS) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9" },
        signal: AbortSignal.timeout(20000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const parsed = parseProducts(html, url);
      results.push(...parsed);
      console.log(`[costco-fetch] ${url} → ${parsed.length} 筆`);
    } catch (e) {
      errors.push(`${url}: ${(e as Error).message}`);
    }
  }
  if (errors.length) {
    console.warn("[costco-fetch] 部分來源失敗:", errors.join(" | "));
  }
  // 去重（依 id）
  const seen = new Set<string>();
  return results.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}
