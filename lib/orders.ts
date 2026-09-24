// 訂單服務：建立訂單、保存下單當時價格、報關資料遮罩、狀態管理。
import { supabase, audit } from "./supabase";
import { CheckoutData } from "./validation";
import { OrderStatus } from "./models";
import { maskIdNumber, generateOrderNumber } from "./id-utils";
import { setShippingFeeStatus, computeShippingTotal } from "./graph/procurement";
import { notifyAdmin } from "./line";

export const SHIPPING_FEE = 0; // 依實際物流設定
export const CUSTOMS_FEE = 0;

export { maskIdNumber, generateOrderNumber, computeShippingTotal };

export async function createOrder(data: CheckoutData): Promise<{ orderId: string; orderNumber: string }> {
  const orderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const orderNumber = generateOrderNumber();
  const productTotal = data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const total = productTotal + SHIPPING_FEE + CUSTOMS_FEE;

  await supabase.from("orders").insert({
    id: orderId, order_number: orderNumber, status: "pending",
    product_total: productTotal, shipping_fee: SHIPPING_FEE, customs_fee: CUSTOMS_FEE, total_amount: total
  });

  for (const item of data.items) {
    await supabase.from("order_items").insert({
      order_id: orderId, product_id: item.productId, product_name: item.name,
      unit_price: item.unitPrice, quantity: item.quantity, subtotal: item.unitPrice * item.quantity,
      image_url: item.imageUrl || null
    });
  }

  await supabase.from("customer_profiles").insert({
    order_id: orderId, name: data.customer.name, phone: data.customer.phone, email: data.customer.email || null,
    address: data.customer.address, postal_code: data.customer.postalCode || null,
    delivery_method: data.customer.deliveryMethod || null, note: data.customer.note || null
  });

  await supabase.from("customs_profiles").insert({
    order_id: orderId, zh_name: data.customs.zhName, id_number: data.customs.idNumber, phone: data.customs.phone,
    email: data.customs.email || null, ezway_phone: data.customs.ezwayPhone || null, consent: data.customs.consent
  });

  await supabase.from("notifications").insert({
    type: "new_order", title: `新訂單 ${orderNumber}`, body: `收到新訂單，共 ${data.items.length} 件商品，總額 NT$${total.toFixed(0)}`
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
