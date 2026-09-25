import { describe, it, expect, vi, beforeEach } from "vitest";

// 以可鏈式呼叫的假 client 取代 Supabase，驗證資料層失敗時的行為。
const state: { result: unknown } = { result: { data: [], error: null } };

function chain() {
  const p: Record<string, unknown> = {};
  const self = () => p;
  for (const m of ["select", "eq", "order", "limit"]) p[m] = vi.fn(self);
  p.then = (resolve: (v: unknown) => unknown) => Promise.resolve(state.result).then(resolve);
  return p;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => chain(),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) }
  }
}));

const { getPublishedWeeklyDeals, getPublishedWeeklyDealsSafe } = await import("../lib/onsite-deals");

beforeEach(() => {
  state.result = { data: [], error: null };
});

describe("現場商品讀取（資料層不可用時的容錯）", () => {
  it("原函式遇到錯誤會拋出，讓呼叫端知道失敗原因", async () => {
    state.result = { data: null, error: { message: "TypeError: fetch failed" } };
    await expect(getPublishedWeeklyDeals()).rejects.toThrow("現場商品讀取失敗：TypeError: fetch failed");
  });

  it("安全版在 Supabase 連線失敗時回傳空清單且不拋出（避免整頁 500）", async () => {
    state.result = { data: null, error: { message: "TypeError: fetch failed" } };
    const r = await getPublishedWeeklyDealsSafe();
    expect(r.unavailable).toBe(true);
    expect(r.deals).toEqual([]);
  });

  it("DNS 解析失敗（專案不存在）同樣不拋出", async () => {
    state.result = { data: null, error: { message: "TypeError: fetch failed (ENOTFOUND)" } };
    const r = await getPublishedWeeklyDealsSafe();
    expect(r.unavailable).toBe(true);
    expect(r.deals).toEqual([]);
  });

  it("正常有資料時回傳商品且 unavailable=false", async () => {
    state.result = {
      data: [
        {
          id: "d1",
          costco_item_number: "1234567",
          product_name_ja: "テスト商品",
          product_name_zh: null,
          primary_photo_url: "https://example.com/a.jpg",
          price_tag_photo_url: null,
          regular_price_jpy: 1980,
          sale_price_jpy: 1480,
          discount_jpy: 500,
          package_quantity: 1,
          package_unit: "個",
          unit_price_label: null,
          sale_end_date: null,
          verification_status: "VERIFIED",
          status: "published"
        }
      ],
      error: null
    };
    const r = await getPublishedWeeklyDealsSafe();
    expect(r.unavailable).toBe(false);
    expect(r.deals).toHaveLength(1);
    expect(r.deals[0].product_name_ja).toBe("テスト商品");
    expect(r.deals[0].sale_price_jpy).toBe(1480);
  });

  it("沒有已發布商品時回傳空清單，unavailable 為 false（與讀取失敗區分）", async () => {
    state.result = { data: [], error: null };
    const r = await getPublishedWeeklyDealsSafe();
    expect(r.unavailable).toBe(false);
    expect(r.deals).toEqual([]);
  });
});
