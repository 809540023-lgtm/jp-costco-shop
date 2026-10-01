import { describe, expect, it } from "vitest";
import {
  MAX_ITEMS,
  MAX_QUANTITY,
  addToCart,
  cartCount,
  cartItemFromProduct,
  cartSubtotal,
  clampQuantity,
  parseCart,
  removeFromCart,
  setQuantity
} from "../lib/cart";

const item = (id: string, price = 100, quantity = 1) => ({
  productId: id,
  name: `商品 ${id}`,
  unitPrice: price,
  quantity,
  imageUrl: null
});

describe("parseCart：壞資料不可污染結帳", () => {
  it("解析字串、陣列；非陣列或壞 JSON 回空陣列", () => {
    expect(parseCart('[{"productId":"a","name":"A","unitPrice":10,"quantity":2}]')).toHaveLength(1);
    expect(parseCart("not json")).toEqual([]);
    expect(parseCart(null)).toEqual([]);
    expect(parseCart({ productId: "a" })).toEqual([]);
  });

  it("丟掉缺 id／數量不合法／0 元或負價的項目", () => {
    const cart = parseCart([
      { productId: "", name: "x", unitPrice: 10, quantity: 1 },
      { productId: "a", name: "A", unitPrice: 0, quantity: 1 },
      { productId: "b", name: "B", unitPrice: -5, quantity: 1 },
      { productId: "c", name: "C", unitPrice: 10, quantity: 0 },
      { productId: "d", name: "D", unitPrice: 10, quantity: 2 }
    ]);
    expect(cart.map((i) => i.productId)).toEqual(["d"]);
  });

  it("同一商品重複出現會合併數量並截斷上限", () => {
    const cart = parseCart([
      { productId: "a", name: "A", unitPrice: 10, quantity: 80 },
      { productId: "a", name: "A", unitPrice: 10, quantity: 80 }
    ]);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(MAX_QUANTITY);
  });

  it("超過 MAX_ITEMS 只保留前幾筆", () => {
    const many = Array.from({ length: MAX_ITEMS + 10 }, (_, i) => ({
      productId: `p${i}`,
      name: `P${i}`,
      unitPrice: 10,
      quantity: 1
    }));
    expect(parseCart(many)).toHaveLength(MAX_ITEMS);
  });
});

describe("addToCart", () => {
  it("新商品可加入，已存在則累加數量", () => {
    const first = addToCart([], item("a"), 2);
    expect(first.ok).toBe(true);
    expect(first.items[0].quantity).toBe(2);

    const second = addToCart(first.items, item("a"), 3);
    expect(second.items[0].quantity).toBe(5);
  });

  it("累加後以最新一次的名稱／價格覆蓋（避免顯示過期資料）", () => {
    const start = [item("a", 100)];
    const result = addToCart(start, { ...item("a", 250), name: "改名後" }, 1);
    expect(result.items[0].unitPrice).toBe(250);
    expect(result.items[0].name).toBe("改名後");
  });

  it("達到 MAX_ITEMS 後不可再加入新商品（回報原因）", () => {
    const full = Array.from({ length: MAX_ITEMS }, (_, i) => item(`p${i}`));
    const result = addToCart(full, item("new"));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("max_items");
    expect(result.items).toHaveLength(MAX_ITEMS);
  });

  it("0 元或數量不合法一律拒絕", () => {
    expect(addToCart([], item("a", 0)).ok).toBe(false);
    expect(addToCart([], item("a", 100), 0).ok).toBe(false);
  });
});

describe("setQuantity / removeFromCart / 統計", () => {
  it("數量設為 0 等於移除", () => {
    expect(setQuantity([item("a"), item("b")], "a", 0).map((i) => i.productId)).toEqual(["b"]);
  });

  it("負數或非數字也視為移除", () => {
    expect(setQuantity([item("a")], "a", -3)).toEqual([]);
    expect(setQuantity([item("a")], "a", Number.NaN)).toEqual([]);
  });

  it("數量超過上限會被截斷", () => {
    expect(setQuantity([item("a")], "a", 1000)[0].quantity).toBe(MAX_QUANTITY);
  });

  it("clampQuantity 邊界", () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(3.7)).toBe(3);
    expect(clampQuantity(Number.NaN)).toBe(1);
  });

  it("removeFromCart 只移除指定商品", () => {
    expect(removeFromCart([item("a"), item("b")], "a").map((i) => i.productId)).toEqual(["b"]);
  });

  it("件數與小計", () => {
    const cart = [item("a", 100, 2), item("b", 50, 3)];
    expect(cartCount(cart)).toBe(5);
    expect(cartSubtotal(cart)).toBe(350);
  });
});

describe("cartItemFromProduct：未定價不可加入購物車", () => {
  it("有台幣定價才回傳項目（並四捨五入）", () => {
    const result = cartItemFromProduct({ id: "p1", zh_name: "中文名", jp_name: "日本語", taiwan_suggested_price: 1440.6 });
    expect(result).not.toBeNull();
    expect(result!.unitPrice).toBe(1441);
    expect(result!.name).toBe("中文名");
    expect(result!.quantity).toBe(1);
  });

  it("缺值或 0 回 null", () => {
    expect(cartItemFromProduct({ id: "p1", jp_name: "日本語", taiwan_suggested_price: null })).toBeNull();
    expect(cartItemFromProduct({ id: "p1", jp_name: "日本語", taiwan_suggested_price: 0 })).toBeNull();
  });

  it("沒有中文名時用日文名", () => {
    expect(cartItemFromProduct({ id: "p1", jp_name: "日本語", taiwan_suggested_price: 100 })!.name).toBe("日本語");
  });
});
