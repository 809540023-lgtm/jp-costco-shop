import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 訂單寫入與查詢用「記憶體假 Supabase」測試。
 *
 * 為什麼不直接跑真資料庫：這是正式站（jp-costco-shop.onrender.com）在用的 Supabase，
 * 建立測試訂單會污染真實訂單資料，所以這裡驗證送出的 payload 與查詢條件即可。
 */
const store = vi.hoisted(() => new Map<string, Record<string, unknown>[]>());

vi.mock("../lib/supabase", () => {
  function builder(table: string, filters: Array<[string, unknown]> = []) {
    const rows = () => {
      const all = store.get(table) ?? [];
      if (!filters.length) return all;
      return all.filter((row) => filters.every(([col, val]) => row[col] === val));
    };
    const api = {
      insert: async (data: unknown) => {
        const list = Array.isArray(data) ? data : [data];
        store.set(table, [...(store.get(table) ?? []), ...(list as Record<string, unknown>[])]);
        return { error: null };
      },
      select: () => api,
      eq: (col: string, val: unknown) => builder(table, [...filters, [col, val]]),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      // 讓 `await supabase.from(x).select().eq(...)` 這種用法可以運作
      then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
        resolve({ data: rows(), error: null })
    };
    return api;
  }
  return {
    supabase: { from: (table: string) => builder(table) },
    audit: async () => {}
  };
});

const { createOrder } = await import("../lib/orders");
const { lookupOrder, getPublicOrderView } = await import("../lib/orders");

const customer = {
  name: "王小明",
  phone: "0912345678",
  email: "",
  address: "台北市大安區信義路四段100號",
  postalCode: "106",
  deliveryMethod: "",
  note: ""
};
const customs = {
  zhName: "王小明",
  idNumber: "A123456789",
  phone: "0912345678",
  email: "",
  ezwayPhone: "",
  consent: true
};
const line = {
  productId: "jp-23343",
  name: "やきとり缶",
  unitPrice: 312,
  quantity: 3,
  imageUrl: "https://example.com/a.jpg",
  subtotal: 936
};

beforeEach(() => store.clear());

describe("createOrder：金額與品項一律採用伺服器解析結果", () => {
  it("寫入 orders／order_items／customer_profiles／customs_profiles／notifications", async () => {
    const result = await createOrder({ lines: [line], customer, customs });

    expect(result.orderNumber).toMatch(/^JP\d{8}[A-Z0-9]{6}$/);

    const order = store.get("orders")![0];
    expect(order).toMatchObject({
      order_number: result.orderNumber,
      status: "pending",
      shipping_fee_status: "pending",
      product_total: 936,
      shipping_fee: 0,
      customs_fee: 0,
      total_amount: 936
    });

    const item = (store.get("order_items") as Record<string, unknown>[])[0];
    expect(item).toMatchObject({
      product_id: "jp-23343",
      product_name: "やきとり缶",
      unit_price: 312,
      quantity: 3,
      subtotal: 936
    });

    expect(store.get("customer_profiles")![0]).toMatchObject({ name: "王小明", phone: "0912345678" });
    expect(store.get("customs_profiles")![0]).toMatchObject({ id_number: "A123456789", consent: true });
    expect(store.get("notifications")![0]).toMatchObject({ title: `新訂單 ${result.orderNumber}` });
  });

  it("空購物車不可成立訂單", async () => {
    await expect(createOrder({ lines: [], customer, customs })).rejects.toThrow("購物車是空的");
    expect(store.get("orders")).toBeUndefined();
  });

  it("多筆明細金額加總正確", async () => {
    await createOrder({
      lines: [line, { ...line, productId: "jp-2", unitPrice: 100, quantity: 2, subtotal: 200 }],
      customer,
      customs
    });
    expect(store.get("orders")![0]).toMatchObject({ product_total: 1136, total_amount: 1136 });
    expect(store.get("order_items")).toHaveLength(2);
  });
});

describe("訂單查詢與個資遮罩", () => {
  it("用手機查詢成功時回傳遮罩後的內容（不含身分證字號）", async () => {
    const { orderNumber } = await createOrder({ lines: [line], customer, customs });

    const view = await lookupOrder(orderNumber, "0912345678");
    expect(view).not.toBeNull();
    expect(view!.orderNumber).toBe(orderNumber);
    expect(view!.productTotal).toBe(936);
    expect(view!.items[0]).toMatchObject({ name: "やきとり缶", quantity: 3, subtotal: 936 });
    expect(view!.customer.name).toBe("王○○");
    expect(view!.customer.phone).toBe("0912***678");
    expect(JSON.stringify(view)).not.toContain("A123456789");
    expect(JSON.stringify(view)).not.toContain("0912345678");
  });

  it("手機不符或格式不足一律查不到（避免猜到編號就看到別人的訂單）", async () => {
    const { orderNumber } = await createOrder({ lines: [line], customer, customs });
    expect(await lookupOrder(orderNumber, "0900000000")).toBeNull();
    expect(await lookupOrder(orderNumber, "091234")).toBeNull();
    expect(await lookupOrder("JP20260101XXXXXX", "0912345678")).toBeNull();
  });

  it("手機寫法不同（含符號）仍可查詢", async () => {
    const { orderNumber } = await createOrder({ lines: [line], customer, customs });
    expect(await lookupOrder(orderNumber, "0912-345-678")).not.toBeNull();
  });

  it("訂單編號不分大小寫", async () => {
    const { orderNumber } = await createOrder({ lines: [line], customer, customs });
    expect(await lookupOrder(orderNumber.toLowerCase(), "0912345678")).not.toBeNull();
  });

  it("getPublicOrderView 查無訂單回 null", async () => {
    expect(await getPublicOrderView("JP20260101ZZZZZZ")).toBeNull();
    expect(await getPublicOrderView("")).toBeNull();
  });
});
