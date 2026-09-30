import { describe, expect, it } from "vitest";
// 共用模組為 .mjs（同時被 scripts/price-missing.mjs 匯入）
import {
  currentJpy,
  needsPricing,
  parsePriceCsv,
  parseTwd,
  planPriceUpdates,
  referenceTwdFor,
  regularJpy
} from "../scripts/lib/pricing.mjs";

describe("缺定價核價（scripts/lib/pricing.mjs）", () => {
  it("現行日幣價取 jp_price；discount_price 是促銷前原價，不可當現行價", () => {
    expect(currentJpy({ jp_price: 4997, discount_price: 5998 })).toBe(4997);
    expect(regularJpy({ jp_price: 4997, discount_price: 5998 })).toBe(5998);
    // 同一價格不算促銷前原價
    expect(regularJpy({ jp_price: 4997, discount_price: 4997 })).toBeNull();
    expect(currentJpy({ jp_price: 0 })).toBeNull();
    expect(currentJpy({})).toBeNull();
  });

  it("參考價 = 日幣現行價 × 匯率；沒有日幣價就不產生", () => {
    expect(referenceTwdFor({ jp_price: 1000 })).toBe(Math.round(1000 * 0.22));
    expect(referenceTwdFor({ jp_price: null })).toBeNull();
    expect(referenceTwdFor({ jp_price: 5998, discount_price: 8980 })).toBe(Math.round(5998 * 0.22));
  });

  it("needsPricing：缺值／0／非數字都要人工定價", () => {
    expect(needsPricing({ taiwan_suggested_price: null })).toBe(true);
    expect(needsPricing({ taiwan_suggested_price: 0 })).toBe(true);
    expect(needsPricing({ taiwan_suggested_price: "abc" })).toBe(true);
    expect(needsPricing({ taiwan_suggested_price: 336 })).toBe(false);
  });

  it("parseTwd：接受千分位與小數，拒絕 0／負數／文字", () => {
    expect(parseTwd("1,234")).toBe(1234);
    expect(parseTwd(" 1099 ")).toBe(1099);
    expect(parseTwd("1099.4")).toBe(1099);
    expect(parseTwd("0")).toBeNull();
    expect(parseTwd("-5")).toBeNull();
    expect(parseTwd("NT$300")).toBeNull();
    expect(parseTwd("")).toBeNull();
    expect(parseTwd(null)).toBeNull();
  });

  it("parsePriceCsv：需要 id 與 twd_price 欄位，支援引號內逗號", () => {
    const ok = parsePriceCsv('id,jp_name,twd_price\n"jp-1","A, B",336\n');
    expect(ok.error).toBeNull();
    expect(ok.rows).toEqual([{ id: "jp-1", twd_price: "336" }]);

    expect(parsePriceCsv("id,jp_name\njp-1,A\n").error).toMatch(/twd_price/);
    expect(parsePriceCsv("").error).toBeTruthy();
  });

  it("planPriceUpdates：只寫已發布、未定價者；空白與非法值略過", () => {
    const published = [
      { id: "jp-1", jp_price: 1000, taiwan_suggested_price: null },
      { id: "jp-2", jp_price: 2000, taiwan_suggested_price: 460 },
      { id: "jp-3", jp_price: null, taiwan_suggested_price: null }
    ];
    const rows = [
      { id: "jp-1", twd_price: "220" },
      { id: "jp-2", twd_price: "999" },
      { id: "jp-3", twd_price: "" },
      { id: "jp-3", twd_price: "abc" },
      { id: "jp-404", twd_price: "100" }
    ];
    const { updates, skipped } = planPriceUpdates(published, rows);

    expect(updates).toEqual([{ id: "jp-1", price: 220, from: null }]);
    expect(skipped.map((s) => s.reason)).toEqual(["already_priced", "invalid_price", "invalid_price", "not_published"]);
  });

  it("planPriceUpdates：--force 才可覆寫已定價，並保留原值供稽核", () => {
    const published = [{ id: "jp-2", taiwan_suggested_price: 460 }];
    const rows = [{ id: "jp-2", twd_price: "999" }];
    const { updates } = planPriceUpdates(published, rows, { force: true });
    expect(updates).toEqual([{ id: "jp-2", price: 999, from: 460 }]);
  });

  it("planPriceUpdates：不會把非已發布商品寫入（下架品不可改價）", () => {
    // fetchPublished 只回已發布，所以不在清單裡的一律 not_published
    const { updates, skipped } = planPriceUpdates([], [{ id: "jp-x", twd_price: "100" }]);
    expect(updates).toEqual([]);
    expect(skipped).toEqual([{ id: "jp-x", reason: "not_published" }]);
  });
});
