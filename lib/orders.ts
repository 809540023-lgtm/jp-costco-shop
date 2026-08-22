// 訂單服務：建立訂單、保存下單當時價格、報關資料遮罩、狀態管理。
import { db, audit } from "./db";
import { CheckoutData } from "./validation";
import { OrderStatus } from "./models";
import { maskIdNumber, generateOrderNumber } from "./id-utils";

export const SHIPPING_FEE = 0; // 依實際物流設定
export const CUSTOMS_FEE = 0;

export { maskIdNumber, generateOrderNumber };

export function createOrder(data: CheckoutData): { orderId: string; orderNumber: string } {
  const orderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const orderNumber = generateOrderNumber();
  const productTotal = data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const total = productTotal + SHIPPING_FEE + CUSTOMS_FEE;

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO orders (id, order_number, status, product_total, shipping_fee, customs_fee, total_amount)
       VALUES (?,?,?,?,?,?,?)`
    ).run(orderId, orderNumber, "pending", productTotal, SHIPPING_FEE, CUSTOMS_FEE, total);

    for (const item of data.items) {
      db.prepare(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, image_url)
         VALUES (?,?,?,?,?,?,?)`
      ).run(orderId, item.productId, item.name, item.unitPrice, item.quantity, item.unitPrice * item.quantity, item.imageUrl || null);
    }

    db.prepare(
      `INSERT INTO customer_profiles (order_id, name, phone, email, address, postal_code, delivery_method, note)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(orderId, data.customer.name, data.customer.phone, data.customer.email || null,
      data.customer.address, data.customer.postalCode || null, data.customer.deliveryMethod || null, data.customer.note || null);

    db.prepare(
      `INSERT INTO customs_profiles (order_id, zh_name, id_number, phone, email, ezway_phone, consent)
       VALUES (?,?,?,?,?,?,?)`
    ).run(orderId, data.customs.zhName, data.customs.idNumber, data.customs.phone,
      data.customs.email || null, data.customs.ezwayPhone || null, data.customs.consent ? 1 : 0);

    db.prepare("INSERT INTO notifications (type, title, body) VALUES ('new_order', ?, ?)")
      .run(`新訂單 ${orderNumber}`, `收到新訂單，共 ${data.items.length} 件商品，總額 NT$${total.toFixed(0)}`);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  audit("customer", "order_created", "order", orderId, orderNumber);
  return { orderId, orderNumber };
}

export function getOrder(orderId: string) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
  if (!order) return null;
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId) as any[];
  const customer = db.prepare("SELECT * FROM customer_profiles WHERE order_id = ?").get(orderId) as any;
  const customs = db.prepare("SELECT * FROM customs_profiles WHERE order_id = ?").get(orderId) as any;
  return { ...order, items, customer, customs };
}

export function listOrders() {
  return db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all() as any[];
}

export function updateOrderStatus(orderId: string, status: OrderStatus, actor = "admin") {
  db.prepare("UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?").run(status, orderId);
  audit(actor, "order_status_changed", "order", orderId, status);
  db.prepare("INSERT INTO notifications (type, title, body) VALUES ('status_change', ?, ?)")
    .run(`訂單狀態更新`, `訂單狀態已更新為 ${status}`);
}
