// 結帳前的伺服器端購物車驗證（**交易金額的唯一依據**）。
//
// 為什麼一定要這一層：購物車存在瀏覽器 localStorage，使用者可以任意改價格
// （先前 /api/checkout 直接採用前端傳來的 unitPrice → 可以 1 元下單）。
// 這裡只接受「商品 id + 數量」，名稱／單價／圖片一律從資料庫重新取，
// 並檢查商品是否仍是已發布、有台幣定價、有庫存。
import { supabase } from "./supabase";
import { MAX_ITEMS, MAX_QUANTITY, clampQuantity } from "./cart";

export interface CartLineInput {
  productId: string;
  quantity: number;
}

export interface ResolvedLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  subtotal: number;
}

export type CartIssueReason =
  | "invalid_line"
  | "not_found"
  | "not_published"
  | "unpriced"
  | "out_of_stock";

export interface CartIssue {
  productId: string;
  reason: CartIssueReason;
  message: string;
}

export interface ResolvedCart {
  lines: ResolvedLine[];
  /** 硬性問題：不可下單（未發布、未定價、找不到） */
  issues: CartIssue[];
  /** 軟性提醒：可以下單，但要讓使用者知道（例如日本標示缺貨） */
  warnings: CartIssue[];
  productTotal: number;
  shippingFee: number;
  customsFee: number;
  total: number;
}

export interface ProductRow {
  id: string;
  zh_name?: string | null;
  jp_name?: string | null;
  english_name?: string | null;
  taiwan_suggested_price?: number | null;
  image_url?: string | null;
  status?: string | null;
  in_stock?: boolean | null;
}

/**
 * 缺貨是否硬性阻擋。
 *
 * 預設 **false（只提醒）**：這是跨境代購，商品是「下單後才去日本採購」，
 * 日方庫存每天都可能變動；而且每日搜尋寫入的 `in_stock` 是抓取當下的狀態，
 * 可能已經過期。實測（2026-10-01）已發布 155 筆中有 50 筆為 false，
 * 若硬擋會讓可購買商品由 80 筆掉到 34 筆，等於把半個賣場鎖住。
 * 真正缺貨的處理放在採購階段（人工確認 + 退款／換貨），與運費閘門同一套邏輯。
 * 若之後要改成硬擋，設定環境變數 BLOCK_OUT_OF_STOCK=true 即可。
 */
export const BLOCK_OUT_OF_STOCK = process.env.BLOCK_OUT_OF_STOCK === "true";

const ISSUE_TEXT: Record<CartIssueReason, string> = {
  invalid_line: "購物車資料格式錯誤",
  not_found: "找不到這個商品，可能已下架",
  not_published: "這個商品目前已停止販售",
  unpriced: "這個商品尚未定價，暫不開放訂購",
  out_of_stock: "目前標示缺貨，我們會在下單後確認能否採購（無法採購會通知你退款或換貨）"
};

export function issueMessage(reason: CartIssueReason): string {
  return ISSUE_TEXT[reason];
}

/** 正規化輸入：只留 productId 與數量，去重、合併、截斷上限（純函式）。 */
export function normalizeLines(raw: unknown): CartLineInput[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { productId?: unknown; quantity?: unknown };
    const productId = typeof row.productId === "string" ? row.productId.trim() : "";
    const qty = Math.floor(Number(row.quantity));
    if (!productId || !Number.isFinite(qty) || qty < 1) continue;
    byId.set(productId, (byId.get(productId) ?? 0) + qty);
  }
  return Array.from(byId.entries())
    .slice(0, MAX_ITEMS)
    .map(([productId, quantity]) => ({ productId, quantity: clampQuantity(quantity) }));
}

/**
 * 以資料庫回傳的商品為準，組出可下單的購物車（純函式，方便測試）。
 * 有任何一項不合格就回報 issue，呼叫端必須整筆拒絕（不可部分成立）。
 */
export function buildResolvedCart(products: ProductRow[], raw: unknown): ResolvedCart {
  const lines = normalizeLines(raw);
  const byId = new Map(products.map((p) => [p.id, p]));
  const resolved: ResolvedLine[] = [];
  const issues: CartIssue[] = [];
  const warnings: CartIssue[] = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) {
      issues.push({ productId: line.productId, reason: "not_found", message: ISSUE_TEXT.not_found });
      continue;
    }
    if (product.status !== "published") {
      issues.push({ productId: line.productId, reason: "not_published", message: ISSUE_TEXT.not_published });
      continue;
    }
    const price = Number(product.taiwan_suggested_price);
    if (!Number.isFinite(price) || price <= 0) {
      issues.push({ productId: line.productId, reason: "unpriced", message: ISSUE_TEXT.unpriced });
      continue;
    }
    const unitPrice = Math.round(price);
    // 缺貨預設只提醒（見 BLOCK_OUT_OF_STOCK 的說明）；in_stock 為 null 視為未標示
    if (product.in_stock === false) {
      const entry = { productId: line.productId, reason: "out_of_stock" as const, message: ISSUE_TEXT.out_of_stock };
      if (BLOCK_OUT_OF_STOCK) {
        issues.push(entry);
        continue;
      }
      warnings.push(entry);
    }
    resolved.push({
      productId: product.id,
      name: product.zh_name || product.jp_name || product.english_name || product.id,
      unitPrice,
      quantity: line.quantity,
      imageUrl: product.image_url ?? null,
      subtotal: unitPrice * line.quantity
    });
  }

  return {
    lines: resolved,
    issues,
    warnings,
    ...totalsFor(resolved)
  };
}

/**
 * 金額：商品小計 + 國際運費 + 報關費。
 * 下單時運費與報關費為 0（運費由人工確認後補收，見 Agent 6 運費閘門），
 * 所以下單頁顯示的「應付總額」就是商品小計，並明確告知運費後補。
 */
export function totalsFor(lines: ResolvedLine[], shippingFee = 0, customsFee = 0): {
  productTotal: number;
  shippingFee: number;
  customsFee: number;
  total: number;
} {
  const productTotal = lines.reduce((sum, l) => sum + l.subtotal, 0);
  return {
    productTotal,
    shippingFee,
    customsFee,
    total: productTotal + Number(shippingFee || 0) + Number(customsFee || 0)
  };
}

const PRODUCT_SELECT = "id, zh_name, jp_name, english_name, taiwan_suggested_price, image_url, status, in_stock";

/** 讀取資料庫並驗證購物車（伺服器端用）。 */
export async function resolveCart(raw: unknown): Promise<ResolvedCart> {
  const lines = normalizeLines(raw);
  if (!lines.length) {
    return { lines: [], issues: [], warnings: [], productTotal: 0, shippingFee: 0, customsFee: 0, total: 0 };
  }
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .in(
      "id",
      lines.map((l) => l.productId)
    );
  if (error) throw new Error(`讀取商品失敗：${error.message}`);
  return buildResolvedCart((data || []) as ProductRow[], lines);
}
