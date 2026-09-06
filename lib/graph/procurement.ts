// Agent 6：訂單與採購自動化（SPEC 第十節）。
// 唯一人工卡點：實際國際運費（shipping_fee_status: pending → confirmed → paid）。
import { supabase } from "@/lib/supabase";
import { graphConfig } from "./config";

export interface PurchaseListRow {
  productRef: string;          // order_items.product_id
  productName: string;         // 保存下單當時名稱
  quantity: number;            // 合計數量
  unitPrice: number;
  orderIds: string[];
}

// 彙總「待採購」商品清單：狀態已付款/採購中，且未出貨。
export async function buildPurchaseList(): Promise<{ items: PurchaseListRow[]; totalItems: number; estimatedCostJpy: number }> {
  const statuses = ["paid", "purchasing"];
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, order_items(product_id, product_name, unit_price, quantity)")
    .in("status", statuses);
  if (error) throw new Error(`待採購訂單讀取失敗：${error.message}`);

  const byProduct = new Map<string, PurchaseListRow>();
  for (const order of data || []) {
    for (const item of (order as { order_items?: Array<{ product_id: string; product_name: string; unit_price: number; quantity: number }> }).order_items || []) {
      const key = item.product_id;
      const row = byProduct.get(key) || {
        productRef: item.product_id,
        productName: item.product_name,
        quantity: 0,
        unitPrice: item.unit_price,
        orderIds: []
      };
      row.quantity += item.quantity;
      if (!row.orderIds.includes(order.id)) row.orderIds.push(order.id);
      byProduct.set(key, row);
    }
  }
  const items = Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity);
  return {
    items,
    totalItems: items.reduce((s, i) => s + i.quantity, 0),
    estimatedCostJpy: 0 // 商品成本以日幣計價，由價格觀測層另估（採購清單先以件數為主）
  };
}

// 運費閘門：唯一人工卡點。
export async function setShippingFeeStatus(
  orderId: string,
  status: (typeof graphConfig.shippingGate.statuses)[number],
  shippingFee?: number,
  actor = "admin"
): Promise<void> {
  const patch: Record<string, unknown> = { shipping_fee_status: status, updated_at: new Date().toISOString() };
  if (typeof shippingFee === "number" && status !== "pending") {
    const { data: order } = await supabase.from("orders").select("product_total, customs_fee").eq("id", orderId).maybeSingle();
    if (order) {
      const total = Number(order.product_total) + shippingFee + Number(order.customs_fee || 0);
      patch.shipping_fee = shippingFee;
      patch.total_amount = total;
    }
  }
  const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
  if (error) throw new Error(`運費閘門更新失敗：${error.message}`);
  await supabase.from("audit_logs").insert({ actor, action: "shipping_fee_status_changed", entity_type: "order", entity_id: orderId, detail: status });
}

// 待出貨包裹整理：運費已確認、尚未寄出的訂單。
export async function listAwaitingShipment() {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, status, total_amount, shipping_fee_status, tracking_number, tracking_status")
    .eq("shipping_fee_status", "confirmed")
    .in("status", ["purchasing", "shipped_from_japan"]);
  if (error) throw new Error(`待出貨訂單讀取失敗：${error.message}`);
  return data || [];
}