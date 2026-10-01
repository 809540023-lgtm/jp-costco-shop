// 購物車核心邏輯（純函式 + localStorage 存取，可被客戶端元件與測試共用）。
//
// 重要原則（AGENTS.md）：
// - 購物車只保存「商品 id 與數量」對應的**顯示用**資料；**實際價格一律以伺服器資料庫為準**
//   （lib/checkout-resolve.ts），前端價格可以被使用者改，不能當作交易依據。
// - 沒有台幣定價（taiwan_suggested_price 缺值或 0）的商品不可加入購物車（避免 0 元訂單）。
import type { CartItem } from "./models";

export const CART_KEY = "jp_costco_cart";
export const CART_EVENT = "jp-costco-cart";
/** 單一商品數量上限（跨境代購，合理上限） */
export const MAX_QUANTITY = 99;
/** 購物車最多幾種商品 */
export const MAX_ITEMS = 30;

export interface CartMutation {
  items: CartItem[];
  ok: boolean;
  reason?: "max_items" | "invalid_quantity";
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i >= 1 ? i : null;
}

/** 把任何來源的資料正規化成合法購物車（壞資料直接丟掉，不讓它污染結帳）。 */
export function parseCart(raw: unknown): CartItem[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];

  const byId = new Map<string, CartItem>();
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Partial<CartItem>;
    const productId = typeof row.productId === "string" ? row.productId.trim() : "";
    const quantity = positiveInt(row.quantity);
    const unitPrice = Number(row.unitPrice);
    if (!productId || quantity == null) continue;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue; // 0 元商品不入車

    const name = typeof row.name === "string" && row.name.trim() ? row.name : productId;
    const imageUrl = typeof row.imageUrl === "string" && row.imageUrl ? row.imageUrl : null;
    const existing = byId.get(productId);
    if (existing) {
      existing.quantity = clampQuantity(existing.quantity + quantity);
    } else {
      byId.set(productId, { productId, name, unitPrice, quantity: clampQuantity(quantity), imageUrl });
    }
  }
  return Array.from(byId.values()).slice(0, MAX_ITEMS);
}

export function clampQuantity(quantity: number): number {
  const n = Math.floor(Number(quantity));
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(n, 1), MAX_QUANTITY);
}

/** 加入購物車（已存在則累加，超過上限回報原因）。 */
export function addToCart(items: CartItem[], item: CartItem, quantity = 1): CartMutation {
  const qty = positiveInt(quantity);
  const price = Number(item.unitPrice);
  if (qty == null || !item.productId || !Number.isFinite(price) || price <= 0) {
    return { items, ok: false, reason: "invalid_quantity" };
  }
  const cart = parseCart(items);
  const existing = cart.find((i) => i.productId === item.productId);
  if (existing) {
    existing.quantity = clampQuantity(existing.quantity + qty);
    // 以最新一次加入的資訊（名稱／價格／圖）為準，避免顯示過期資料
    existing.name = item.name || existing.name;
    existing.unitPrice = price;
    existing.imageUrl = item.imageUrl ?? existing.imageUrl;
    return { items: cart, ok: true };
  }
  if (cart.length >= MAX_ITEMS) return { items: cart, ok: false, reason: "max_items" };
  cart.push({
    productId: item.productId,
    name: item.name || item.productId,
    unitPrice: price,
    quantity: clampQuantity(qty),
    imageUrl: item.imageUrl ?? null
  });
  return { items: cart, ok: true };
}

/** 設定數量（0 或負數＝移除，超過上限自動截斷）。 */
export function setQuantity(items: CartItem[], productId: string, quantity: number): CartItem[] {
  const n = Math.floor(Number(quantity));
  if (!Number.isFinite(n) || n <= 0) return removeFromCart(items, productId);
  return parseCart(items).map((i) => (i.productId === productId ? { ...i, quantity: clampQuantity(n) } : i));
}

export function removeFromCart(items: CartItem[], productId: string): CartItem[] {
  return parseCart(items).filter((i) => i.productId !== productId);
}

/** 總件數（顯示在標頭徽章）。 */
export function cartCount(items: CartItem[]): number {
  return parseCart(items).reduce((sum, i) => sum + i.quantity, 0);
}

/** 小計（**僅供顯示**；結帳金額由伺服器重算）。 */
export function cartSubtotal(items: CartItem[]): number {
  return parseCart(items).reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}

/** 用商品資料建立購物車項目；沒有台幣定價回 null（呼叫端顯示「未定價，暫不開放訂購」）。 */
export function cartItemFromProduct(product: {
  id: string;
  zh_name?: string | null;
  jp_name?: string | null;
  taiwan_suggested_price?: number | null;
  image_url?: string | null;
}): CartItem | null {
  const price = Number(product.taiwan_suggested_price);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    productId: product.id,
    name: product.zh_name || product.jp_name || product.id,
    unitPrice: Math.round(price),
    quantity: 1,
    imageUrl: product.image_url ?? null
  };
}

// ── 瀏覽器儲存（只在客戶端呼叫）────────────────────────────────────────
export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  return parseCart(window.localStorage.getItem(CART_KEY));
}

export function writeCart(items: CartItem[]): CartItem[] {
  const cart = parseCart(items);
  if (typeof window === "undefined") return cart;
  window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: cart }));
  return cart;
}

export function clearCart(): CartItem[] {
  return writeCart([]);
}

/**
 * 訂閱購物車變化：同一個分頁（自訂事件）與其他分頁（storage 事件）都會通知。
 * 回傳取消訂閱函式。
 */
export function subscribeCart(callback: (items: CartItem[]) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = (event: Event) => {
    const detail = (event as CustomEvent<CartItem[]>).detail;
    callback(parseCart(detail ?? readCart()));
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== CART_KEY) return;
    callback(readCart());
  };
  window.addEventListener(CART_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CART_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}
