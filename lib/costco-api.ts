// 日本 Costco 官方 REST API 擷取模組（3.0「擷取」補完）。
// 目的：每日搜尋原本只用 HTML 抓商品連結（lib/costco-fetch.ts），得不到價格、評分、
// 評論數與圖片，導致 lib/ranking.ts 的 reviews 權重（0.6）與 Hot Buy 訊號完全失效、
// 商品頁也沒有日本價格。本模組改以官方 API 為主要來源，HTML 解析退為備援。
// 證據規則：只用官方回傳欄位；單一價格不視為特價，需官方 discountPrice／discountStartDate
// 或 "Hot Buy" 標籤等明確促銷證據才標記促銷。
import type { RawProduct } from "./search";

export const OFFICIAL_API_BASE = "https://www.costco.co.jp/rest/v2/japan/products/search";
export const OFFICIAL_SITE = "https://www.costco.co.jp";
export const STOCK_IN_STOCK = "inStock";

// 官方回傳結構（僅列出本模組使用的欄位，其餘忽略）
interface ApiPrice {
  value?: number | null;
  formattedValue?: string | null;
}
interface ApiImage {
  format?: string | null;
  url?: string | null;
}
interface ApiDecal {
  key?: string | null;
  value?: { altText?: string | null; type?: string | null; position?: number | null } | null;
}
export interface OfficialApiProduct {
  code?: string | number | null;
  name?: string | null;
  englishName?: string | null;
  url?: string | null;
  summary?: string | null;
  averageRating?: number | null;
  numberOfReviews?: number | null;
  price?: ApiPrice | null;
  basePrice?: ApiPrice | null;
  discountPrice?: ApiPrice | null;
  discountStartDate?: string | null;
  discountEndDate?: string | null;
  stock?: { stockLevelStatus?: string | null } | null;
  images?: ApiImage[] | null;
  decalData?: ApiDecal[] | null;
  purchasable?: boolean | null;
}

export interface OfficialDecals {
  hotBuy: boolean;
  madeInJapan: boolean;
  badges: string[];
}

export interface OfficialPromotion {
  hasPromotion: boolean;
  regularPrice: number | null;
  currentPrice: number | null;
  discountAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  evidence: string | null;
}

// 官方促銷證據：需同時具備「折扣價／折扣區間」與「原價高於現行價」才算特價。
export function extractPromotion(p: OfficialApiProduct): OfficialPromotion {
  const current = numOrNull(p.price?.value);
  const regular = numOrNull(p.basePrice?.value);
  const discount = numOrNull(p.discountPrice?.value);
  const hasDiscountWindow = Boolean(p.discountStartDate || p.discountEndDate);
  const hasPromotion = current != null && regular != null && regular > current && (hasDiscountWindow || discount != null);
  if (!hasPromotion) {
    return { hasPromotion: false, regularPrice: regular, currentPrice: current, discountAmount: null, startDate: null, endDate: null, evidence: null };
  }
  return {
    hasPromotion: true,
    regularPrice: regular,
    currentPrice: current,
    discountAmount: discount != null ? discount : Math.round((regular as number) - current),
    startDate: p.discountStartDate ?? null,
    endDate: p.discountEndDate ?? null,
    evidence: `官方折扣 ${dateRangeText(p.discountStartDate, p.discountEndDate)}`.trim()
  };
}

function dateRangeText(start?: string | null, end?: string | null): string {
  const f = (v?: string | null) => (v ? v.slice(0, 10) : "?");
  if (!start && !end) return "";
  return `${f(start)} ~ ${f(end)}`;
}

export function extractDecals(decalData?: ApiDecal[] | null): OfficialDecals {
  const badges = (decalData || [])
    .map((d) => d?.value?.altText?.trim())
    .filter((t): t is string => Boolean(t));
  return {
    hotBuy: badges.some((t) => /hot\s*buy/i.test(t)),
    madeInJapan: badges.some((t) => /made\s*in\s*japan|日本製/i.test(t)),
    badges: [...new Set(badges)]
  };
}

export function absoluteCostcoUrl(url?: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${OFFICIAL_SITE}${url.startsWith("/") ? "" : "/"}${url}`;
}

// 高解析度優先：zoom > product > thumbnail
export function pickImageUrl(images?: ApiImage[] | null): string | null {
  const order = ["zoom", "product", "thumbnail"];
  for (const fmt of order) {
    const hit = (images || []).find((i) => i?.format === fmt && i?.url);
    if (hit?.url) return absoluteCostcoUrl(hit.url);
  }
  const fallback = (images || []).find((i) => i?.url);
  return fallback?.url ? absoluteCostcoUrl(fallback.url) : null;
}

// 官方 summary 是 HTML 清單，轉為純文字（保留項目符號）供商品頁顯示。
export function summaryToText(summary?: string | null): string | null {
  if (!summary) return null;
  const text = summary
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `• ${line}`)
    .join("\n");
  return text || null;
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// 官方商品 → 內部 RawProduct。缺 code 或 name 視為無效資料（回 null）。
export function mapOfficialProduct(p: OfficialApiProduct): RawProduct | null {
  const code = p.code == null ? null : String(p.code).trim();
  const name = p.name?.trim();
  if (!code || !name) return null;
  const promo = extractPromotion(p);
  const decals = extractDecals(p.decalData);
  const priceValue = promo.currentPrice ?? numOrNull(p.price?.value);
  return {
    id: `jp-${code}`,
    jpName: name,
    englishName: p.englishName?.trim() || undefined,
    costcoUrl: absoluteCostcoUrl(p.url) ?? undefined,
    imageUrl: pickImageUrl(p.images) ?? undefined,
    jpPrice: priceValue ?? undefined,
    regularPrice: promo.hasPromotion ? promo.regularPrice ?? undefined : undefined,
    promoEvidence: promo.evidence ?? undefined,
    isHotBuy: decals.hotBuy,
    madeInJapan: decals.madeInJapan,
    officialBadges: decals.badges.length ? decals.badges : undefined,
    inStock: p.stock?.stockLevelStatus === STOCK_IN_STOCK,
    rating: numOrNull(p.averageRating) ?? undefined,
    reviewCount: numOrNull(p.numberOfReviews) ?? undefined,
    summary: summaryToText(p.summary) ?? undefined,
    priceConfirmedAt: priceValue != null ? new Date().toISOString() : undefined,
    evidenceSource: OFFICIAL_API_BASE,
    evidenceType: "official_rest_api"
  };
}

export interface OfficialFetchOptions {
  pages?: number;
  pageSize?: number;
  query?: string;
  timeoutMs?: number;
}

export interface OfficialFetchResult {
  products: RawProduct[];
  pagesFetched: number;
  totalResults: number;
  errors: string[];
}

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// 依官方 sellCount（熱銷）排序抓取多頁。單頁失敗不影響其他頁，錯誤全部回報給呼叫端。
export async function fetchOfficialProducts(options: OfficialFetchOptions = {}): Promise<OfficialFetchResult> {
  const pages = Math.max(1, Math.min(options.pages ?? Number(process.env.COSTCO_FETCH_PAGES || 3), 20));
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 100, 100));
  const query = options.query ?? ":sellCount-desc";
  const timeoutMs = options.timeoutMs ?? 20000;

  const products: RawProduct[] = [];
  const errors: string[] = [];
  let pagesFetched = 0;
  let totalResults = 0;

  for (let page = 0; page < pages; page += 1) {
    const url = `${OFFICIAL_API_BASE}?query=${encodeURIComponent(query)}&currentPage=${page}&pageSize=${pageSize}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "ja-JP,ja;q=0.9" },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { products?: OfficialApiProduct[]; pagination?: { totalResults?: number } };
      const rows = data.products || [];
      totalResults = data.pagination?.totalResults ?? totalResults;
      pagesFetched += 1;
      for (const row of rows) {
        const mapped = mapOfficialProduct(row);
        if (mapped) products.push(mapped);
      }
      if (!rows.length) break; // 沒有下一頁
    } catch (e) {
      errors.push(`page ${page}: ${(e as Error).message}`);
    }
  }

  if (errors.length) console.warn("[costco-api] 官方 API 部分頁面失敗:", errors.join(" | "));
  return { products, pagesFetched, totalResults, errors };
}
