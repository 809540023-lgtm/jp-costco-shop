// 訂單狀態的中文標籤與進度（給客戶端的訂單查詢頁用；純函式方便測試）。
import type { OrderStatus } from "./models";

/** 正常流程的順序（不含取消與異常狀態）。 */
export const ORDER_FLOW: OrderStatus[] = [
  "pending",
  "awaiting_payment",
  "paid",
  "purchasing",
  "shipped_from_japan",
  "customs_clearance",
  "taiwan_received",
  "shipping_to_customer",
  "completed"
];

const LABELS: Record<OrderStatus, string> = {
  pending: "已收到訂單",
  awaiting_payment: "等待付款",
  paid: "已付款",
  purchasing: "日本採購中",
  shipped_from_japan: "已從日本寄出",
  customs_clearance: "海關報關中",
  taiwan_received: "已抵達台灣",
  shipping_to_customer: "配送給客戶中",
  completed: "已完成",
  cancelled: "已取消",
  customs_problem: "報關異常"
};

const DESCRIPTIONS: Partial<Record<OrderStatus, string>> = {
  pending: "我們已收到訂單，會盡快與你確認付款方式。",
  awaiting_payment: "請依通知完成付款。",
  paid: "款項已確認，準備進入日本採購。",
  purchasing: "正在日本 Costco 採購你的商品。",
  shipped_from_japan: "商品已寄出，國際運送中。",
  customs_clearance: "正在辦理台灣進口報關，請留意 EZ WAY 實名認證通知。",
  taiwan_received: "商品已抵達台灣，準備配送。",
  shipping_to_customer: "已交由台灣端物流配送。",
  completed: "訂單已完成，感謝購買。",
  cancelled: "此訂單已取消。",
  customs_problem: "報關過程有問題，我們會與你聯繫處理。"
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "狀態不明";
  return LABELS[status as OrderStatus] ?? status;
}

export function statusDescription(status: string | null | undefined): string {
  if (!status) return "";
  return DESCRIPTIONS[status as OrderStatus] ?? "";
}

/** 在正常流程中的進度（1 起算）；取消／異常回 0。 */
export function flowStep(status: string | null | undefined): number {
  const index = ORDER_FLOW.indexOf(status as OrderStatus);
  return index < 0 ? 0 : index + 1;
}

export function isClosed(status: string | null | undefined): boolean {
  return status === "completed" || status === "cancelled";
}

export type ShippingGateStatus = "pending" | "confirmed" | "paid";

const SHIPPING_LABELS: Record<ShippingGateStatus, string> = {
  pending: "運費待確認",
  confirmed: "運費已確認，待補款",
  paid: "運費已補款"
};

export function shippingGateLabel(status: string | null | undefined): string {
  if (!status) return SHIPPING_LABELS.pending;
  return SHIPPING_LABELS[status as ShippingGateStatus] ?? status;
}

/** 客戶端顯示用的個資遮罩（後端回傳前就已遮罩，這裡只做保險）。 */
export function maskName(name: string | null | undefined): string {
  const value = (name || "").trim();
  if (!value) return "—";
  if (value.length === 1) return value;
  return value[0] + "○".repeat(Math.min(value.length - 1, 3));
}

export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 6) return "—";
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}

export function maskAddress(address: string | null | undefined): string {
  const value = (address || "").trim();
  if (!value) return "—";
  return value.length <= 6 ? `${value.slice(0, 3)}***` : `${value.slice(0, 6)}***`;
}
