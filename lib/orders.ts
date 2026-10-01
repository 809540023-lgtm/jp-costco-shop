// 訂單服務：建立訂單、保存下單當時價格、報關資料遮罩、狀態管理。
import { supabase, audit } from "./supabase";
import type { CheckoutData } from "./validation";
import { OrderStatus } from "./models";
import { maskIdNumber, generateOrderNumber } from "./id-utils";
import { setShippingFeeStatus, computeShippingTotal } from "./graph/procurement";
import { notifyAdmin } from "./line";
import { totalsFor, type ResolvedLine } from "./checkout-resolve";
import { maskAddress, maskName, maskPhone } from "./order-status";

export const SHIPPING_FEE = 0; // 依實際物流設定
export const CUSTOMS_FEE = 0;

export { maskIdNumber, generateOrderNumber, computeShippingTotal };

/**
 * 建立訂單。
 *
 * ⚠️ `lines` 必須是**伺服器解析過**的內容（`lib/checkout-resolve.ts` 用資料庫的
 * 名稱與價格組成），不可直接採用前端傳來的價格。
 */
export async function createOrder(input: {
  lines: ResolvedLine[];
  customer: CheckoutData["customer"];
  customs: CheckoutData["customs"];
}): Promise<{ orderId: string; orderNumber: string }> {
  const { lines, customer, customs } = input;
  if (!lines.length) throw new Error("購物車是空的");

  const orderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const orderNumber = generateOrderNumber();
  const { productTotal, shippingFee, customsFee, total } = totalsFor(lines, SHIPPING_FEE, CUSTOMS_FEE);

  const { error: orderError } = await supabase.from("orders").insert({
    id: orderId,
    order_number: orderNumber,
    status: "pending",
    shipping_fee_status: "pending",
    product_total: productTotal,
    shipping_fee: shippingFee,
    customs_fee: customsFee,
    total_amount: total
  });
  if (orderError) throw new Error(`建立訂單失敗：${orderError.message}`);

  const { error: itemsError } = await supabase.from("order_items").insert(
    lines.map((line) => ({
      order_id: orderId,
      product_id: line.productId,
      product_name: line.name, // 保存下單當時的名稱與價格
      unit_price: line.unitPrice,
      quantity: line.quantity,
      subtotal: line.subtotal,
      image_url: line.imageUrl || null
    }))
  );
  if (itemsError) throw new Error(`建立訂單明細失敗：${itemsError.message}`);

  await supabase.from("customer_profiles").insert({
    order_id: orderId, name: customer.name, phone: customer.phone, email: customer.email || null,
    address: customer.address, postal_code: customer.postalCode || null,
    delivery_method: customer.deliveryMethod || null, note: customer.note || null
  });

  await supabase.from("customs_profiles").insert({
    order_id: orderId, zh_name: customs.zhName, id_number: customs.idNumber, phone: customs.phone,
    email: customs.email || null, ezway_phone: customs.ezwayPhone || null, consent: customs.consent
  });

  await supabase.from("notifications").insert({
    type: "new_order", title: `新訂單 ${orderNumber}`, body: `收到新訂單，共 ${lines.length} 件商品，總額 NT$${total.toFixed(0)}`
  });

  await audit("customer", "order_created", "order", orderId, orderNumber);
  return { orderId, orderNumber };
}

export async function getOrder(orderId: string): Promise<any | null> {
  const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return null;
  const { data: items } = await supabase.from("order_items").select("*").eq("order_id", orderId);
  const { data: customer } = await supabase.from("customer_profiles").select("*").eq("order_id", orderId).maybeSingle();
  const { data: customs } = await supabase.from("customs_profiles").select("*").eq("order_id", orderId).maybeSingle();
  return { ...order, items: items || [], customer, customs };
}

export async function listOrders(): Promise<any[]> {
  const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  return data || [];
}

/** 客戶端可見的訂單檢視（個資一律遮罩，不含身分證字號）。 */
export interface PublicOrderView {
  orderNumber: string;
  status: string;
  shippingFeeStatus: string;
  createdAt: string | null;
  productTotal: number;
  shippingFee: number;
  customsFee: number;
  totalAmount: number;
  items: Array<{ productId: string; name: string; unitPrice: number; quantity: number; subtotal: number; imageUrl: string | null }>;
  customer: { name: string; phone: string; address: string };
}

function toPublicView(order: any, items: any[], customer: any): PublicOrderView {
  return {
    orderNumber: order.order_number,
    status: order.status,
    shippingFeeStatus: order.shipping_fee_status || "pending",
    createdAt: order.created_at || null,
    productTotal: Number(order.product_total || 0),
    shippingFee: Number(order.shipping_fee || 0),
    customsFee: Number(order.customs_fee || 0),
    totalAmount: Number(order.total_amount || 0),
    items: (items || []).map((i) => ({
      productId: i.product_id,
      name: i.product_name,
      unitPrice: Number(i.unit_price || 0),
      quantity: Number(i.quantity || 0),
      subtotal: Number(i.subtotal || 0),
      imageUrl: i.image_url || null
    })),
    customer: {
      name: maskName(customer?.name),
      phone: maskPhone(customer?.phone),
      address: maskAddress(customer?.address)
    }
  };
}

/** 依訂單編號取訂單（已遮罩）；查無回 null。 */
export async function getPublicOrderView(orderNumber: string): Promise<PublicOrderView | null> {
  const number = (orderNumber || "").trim().toUpperCase();
  if (!number) return null;
  const { data: order } = await supabase.from("orders").select("*").eq("order_number", number).maybeSingle();
  if (!order) return null;
  const { data: items } = await supabase.from("order_items").select("*").eq("order_id", order.id);
  const { data: customer } = await supabase.from("customer_profiles").select("*").eq("order_id", order.id).maybeSingle();
  return toPublicView(order, items || [], customer);
}

/**
 * 訂單查詢：必須「訂單編號 + 下單手機」同時正確才回傳，避免只猜到編號就看到內容。
 * 手機比對只看數字（容忍 09xx-xxx-xxx 之類的寫法）。
 */
export async function lookupOrder(orderNumber: string, phone: string): Promise<PublicOrderView | null> {
  const number = (orderNumber || "").trim().toUpperCase();
  const digits = (phone || "").replace(/\D/g, "");
  if (!number || digits.length < 9) return null;

  const { data: order } = await supabase.from("orders").select("*").eq("order_number", number).maybeSingle();
  if (!order) return null;
  const { data: customer } = await supabase.from("customer_profiles").select("*").eq("order_id", order.id).maybeSingle();
  if (!customer) return null;
  if ((customer.phone || "").replace(/\D/g, "") !== digits) return null;

  const { data: items } = await supabase.from("order_items").select("*").eq("order_id", order.id);
  return toPublicView(order, items || [], customer);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, actor = "admin") {
  await supabase.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", orderId);
  await audit(actor, "order_status_changed", "order", orderId, status);
  await supabase.from("notifications").insert({ type: "status_change", title: "訂單狀態更新", body: `訂單狀態已更新為 ${status}` });
}

// Agent 6 運費人工閘門（SPEC 第十節）：輸入實際國際運費 → 確認 → 通知客戶補款。
// 唯一人工卡點，只改 shipping_fee_status 與金額欄位，不動既有訂單狀態流程。
export async function confirmShippingFee(orderId: string, shippingFee: number, actor = "admin") {
  if (!Number.isFinite(shippingFee) || shippingFee < 0) throw new Error("運費金額不正確");
  await setShippingFeeStatus(orderId, "confirmed", shippingFee, actor);
  const order = await getOrder(orderId);
  const total = computeShippingTotal(Number(order?.product_total || 0), shippingFee, Number(order?.customs_fee || 0));
  await supabase.from("notifications").insert({
    type: "shipping_fee_confirmed",
    title: `運費已確認 ${order?.order_number || orderId}`,
    body: `國際運費 NT$${shippingFee.toFixed(0)}，應付總額 NT$${total.toFixed(0)}，請通知客戶補款。`
  });
  // LINE 只傳訂單編號與金額，不含客戶個資。
  await notifyAdmin(`🚚 運費已確認：${order?.order_number || orderId}　運費 NT$${shippingFee.toFixed(0)} → 應付總額 NT$${total.toFixed(0)}，請通知客戶補款。`);
  return { totalAmount: total };
}

// 客戶完成補款後關閉運費閘門（confirmed → paid）。
export async function markShippingFeePaid(orderId: string, actor = "admin") {
  await setShippingFeeStatus(orderId, "paid", undefined, actor);
  const order = await getOrder(orderId);
  await supabase.from("notifications").insert({
    type: "shipping_fee_paid",
    title: `運費已付款 ${order?.order_number || orderId}`,
    body: "運費閘門已關閉，訂單可進入採購／出貨流程。"
  });
}
