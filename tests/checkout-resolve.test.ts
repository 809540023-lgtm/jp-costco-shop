import { describe, expect, it } from "vitest";
import { buildResolvedCart, normalizeLines, totalsFor, type ProductRow } from "../lib/checkout-resolve";
import { MAX_ITEMS, MAX_QUANTITY } from "../lib/cart";

const product = (over: Partial<ProductRow> & { id: string }): ProductRow => ({
  zh_name: "中文名",
  jp_name: "日本語名",
  taiwan_suggested_price: 1000,
  image_url: "https://example.com/a.jpg",
  status: "published",
  in_stock: true,
  ...over
});

describe("normalizeLines：只接受 id 與數量", () => {
  it("丟掉沒有 productId 或數量小於 1 的項目", () => {
    const lines = normalizeLines([
      { productId: "a", quantity: 2 },
      { productId: "", quantity: 2 },
      { productId: "b", quantity: 0 },
      { productId: "c", quantity: "x" },
      { quantity: 5 }
    ]);
    expect(lines).toEqual([{ productId: "a", quantity: 2 }]);
  });

  it("同一商品合併並截斷上限", () => {
    const lines = normalizeLines([
      { productId: "a", quantity: 60 },
      { productId: "a", quantity: 60 },
      { productId: "a", quantity: 1 }
    ]);
    expect(lines).toEqual([{ productId: "a", quantity: MAX_QUANTITY }]);
  });

  it("忽略前端偷帶的價格欄位（不影響輸出）", () => {
    const lines = normalizeLines([{ productId: "a", quantity: 1, unitPrice: 1, name: "假的", imageUrl: "x" }]);
    expect(lines).toEqual([{ productId: "a", quantity: 1 }]);
  });

  it("項目數上限", () => {
    const many = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => ({ productId: `p${i}`, quantity: 1 }));
    expect(normalizeLines(many)).toHaveLength(MAX_ITEMS);
  });

  it("非陣列回空陣列", () => {
    expect(normalizeLines(null)).toEqual([]);
    expect(normalizeLines({ productId: "a", quantity: 1 })).toEqual([]);
  });
});

describe("buildResolvedCart：價格一律以資料庫為準", () => {
  it("前端送來的價格不會被採用，一律用資料庫價格", () => {
    const result = buildResolvedCart([product({ id: "a", taiwan_suggested_price: 1440 })], [
      { productId: "a", quantity: 2, unitPrice: 1, name: "駭客價" }
    ]);
    expect(result.issues).toEqual([]);
    expect(result.lines[0].unitPrice).toBe(1440);
    expect(result.lines[0].name).toBe("中文名");
    expect(result.lines[0].subtotal).toBe(2880);
    expect(result.productTotal).toBe(2880);
    expect(result.total).toBe(2880);
  });

  it("找不到商品、未發布、未定價各自回報 issue", () => {
    const products = [
      product({ id: "draft", status: "pending_review" }),
      product({ id: "unpriced", taiwan_suggested_price: null }),
      product({ id: "zeroprice", taiwan_suggested_price: 0 })
    ];
    const result = buildResolvedCart(products, [
      { productId: "missing", quantity: 1 },
      { productId: "draft", quantity: 1 },
      { productId: "unpriced", quantity: 1 },
      { productId: "zeroprice", quantity: 1 }
    ]);
    expect(result.lines).toEqual([]);
    expect(result.issues.map((i) => i.reason)).toEqual([
      "not_found",
      "not_published",
      "unpriced",
      "unpriced"
    ]);
    expect(result.productTotal).toBe(0);
  });

  it("缺貨預設只「提醒」不擋單（跨境代購下單後才採購）", () => {
    const result = buildResolvedCart([product({ id: "oos", in_stock: false })], [{ productId: "oos", quantity: 1 }]);
    expect(result.issues).toEqual([]);
    expect(result.warnings.map((w) => w.reason)).toEqual(["out_of_stock"]);
    expect(result.lines).toHaveLength(1);
    expect(result.productTotal).toBe(1000);
  });

  it("in_stock 為 null（來源沒帶庫存）不阻擋也不提醒", () => {
    const result = buildResolvedCart([product({ id: "a", in_stock: null })], [{ productId: "a", quantity: 1 }]);
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.lines).toHaveLength(1);
  });

  it("通過的商品才計入金額；有問題的整批由呼叫端拒絕", () => {
    const products = [product({ id: "ok" }), product({ id: "bad", status: "archived" })];
    const result = buildResolvedCart(products, [
      { productId: "ok", quantity: 2 },
      { productId: "bad", quantity: 1 }
    ]);
    expect(result.lines).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
    expect(result.productTotal).toBe(2000);
  });

  it("名稱優先序：中文 > 日文 > 英文 > 商品 id", () => {
    const byJp = buildResolvedCart([product({ id: "a", zh_name: null })], [{ productId: "a", quantity: 1 }]);
    expect(byJp.lines[0].name).toBe("日本語名");

    const byId = buildResolvedCart(
      [product({ id: "a", zh_name: null, jp_name: null })],
      [{ productId: "a", quantity: 1 }]
    );
    expect(byId.lines[0].name).toBe("a"); // 中文／日文／英文都沒有 → 退回商品 id
  });
});

describe("totalsFor", () => {
  it("運費與關稅預設 0（下單時未定，由人工閘門後補）", () => {
    const totals = totalsFor([{ productId: "a", name: "A", unitPrice: 100, quantity: 3, imageUrl: null, subtotal: 300 }]);
    expect(totals).toEqual({ productTotal: 300, shippingFee: 0, customsFee: 0, total: 300 });
  });

  it("帶入運費與關稅時加總", () => {
    const totals = totalsFor(
      [{ productId: "a", name: "A", unitPrice: 100, quantity: 1, imageUrl: null, subtotal: 100 }],
      250,
      30
    );
    expect(totals.total).toBe(380);
  });
});
