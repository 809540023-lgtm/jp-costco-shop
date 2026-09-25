import { describe, it, expect, vi, beforeEach } from "vitest";

// 以可鏈式呼叫的假 client 取代 Supabase，驗證每日搜尋在資料層失敗時的行為。
type Result = { data?: unknown; error: { message: string } | null };

// results 逐次取用（模擬前幾次成功、之後失敗）；用盡後一律回傳 fallback。
const state: { results: Result[]; fallback: Result } = {
  results: [],
  fallback: { data: [], error: null }
};

function nextResult() {
  return state.results.length ? state.results.shift()! : state.fallback;
}

function chain() {
  const p: Record<string, unknown> = {};
  const self = () => p;
  for (const m of ["insert", "upsert", "update", "eq", "select"]) p[m] = vi.fn(self);
  p.then = (resolve: (v: unknown) => unknown) => Promise.resolve(nextResult()).then(resolve);
  return p;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => chain() },
  audit: vi.fn()
}));

const { runDailySearch } = await import("../lib/search");

const raw = {
  id: "jp-1730866",
  jpName: "日本製 ステンレスボトル 0.71L",
  jpPrice: 1980,
  isHotBuy: true,
  isNew: true,
  madeInJapan: true,
  rating: 4.6,
  reviewCount: 339
};

beforeEach(() => {
  state.results = [];
  state.fallback = { data: [], error: null };
});

describe("每日搜尋批次寫入", () => {
  it("資料層完全失敗時丟錯，不回報假的成功", async () => {
    state.fallback = { data: null, error: { message: "TypeError: fetch failed" } };
    await expect(runDailySearch([raw])).rejects.toThrow("建立搜尋批次失敗：TypeError: fetch failed");
  });

  it("建立批次成功但商品寫入失敗時丟錯（不再靜默吞掉）", async () => {
    state.results = [{ data: [], error: null }];
    state.fallback = { data: null, error: { message: "TypeError: fetch failed" } };
    await expect(runDailySearch([raw])).rejects.toThrow("寫入商品失敗（jp-1730866）：TypeError: fetch failed");
  });

  it("成功時回傳批次編號與保留件數", async () => {
    const r = await runDailySearch([raw]);
    expect(r.batchId).toMatch(/^sb-\d{4}-\d{2}-\d{2}-\d{6}$/);
    expect(r.count).toBe(1);
  });
});
