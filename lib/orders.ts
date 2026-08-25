// 訂單服務：建立訂單、保存下單當時價格、報關資料遮罩、狀態管理。
import { supabase, audit } from "./supabase";
import { CheckoutData } from "./validation";
import { OrderStatus } from "./models";
import { maskIdNumber, generateOrderNumber } from "./id-utils";

export const SHIPPING_FEE = 0; // 依實際物流設定
export const CUSTOMS_FEE = 0;

export { maskIdNumber, generateOrderNumber };

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
