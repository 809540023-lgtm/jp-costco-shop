import { describe, expect, it } from "vitest";
// 共用模組為 .mjs（同時被 scripts/bootstrap-entities.js 匯入）
import {
  canonicalName,
  entityKey,
  expectedEntityStatus,
  planStatusRepairs
} from "../scripts/lib/entity-status.mjs";

describe("entity-status", () => {
  it("標準名優先序：繁中 > 英文 > 日文", () => {
    expect(canonicalName({ zh_name: "中", english_name: "EN", jp_name: "日" })).toBe("中");
    expect(canonicalName({ zh_name: "", english_name: "EN", jp_name: "日" })).toBe("EN");
    expect(canonicalName({ jp_name: "日" })).toBe("日");
    expect(canonicalName({})).toBe("");
  });

  it("已發布商品 → listed；其餘 → candidate", () => {
    expect(expectedEntityStatus({ status: "published" })).toBe("listed");
    expect(expectedEntityStatus({ status: "pending_review" })).toBe("candidate");
    expect(expectedEntityStatus({ status: "rejected" })).toBe("candidate");
    expect(expectedEntityStatus(null)).toBe("candidate");
  });

  it("還原被誤標的已上架實體（2026-09-27 實例：56 筆 listed 被打成 rejected）", () => {
    const products = [
      { zh_name: "小林製薬 メガネクリーナ", brand: "小林製薬", status: "published" },
      { zh_name: "待審商品", brand: null, status: "pending_review" }
    ];
    const entities = [
      { id: "e1", canonical_name: "小林製薬 メガネクリーナ", brand: "小林製薬", status: "rejected" },
      { id: "e2", canonical_name: "待審商品", brand: null, status: "candidate" }
    ];
    const repairs = planStatusRepairs(products, entities);
    expect(repairs).toHaveLength(1);
    expect(repairs[0]).toMatchObject({ id: "e1", from: "rejected", to: "listed" });
  });

  it("已是 listed 的不重複處理；已發布以外不修復", () => {
    const products = [{ zh_name: "A", brand: "B", status: "published" }];
    expect(planStatusRepairs(products, [{ id: "e1", canonical_name: "A", brand: "B", status: "listed" }])).toEqual([]);
    expect(planStatusRepairs(products, [{ id: "e2", canonical_name: "A", brand: "C", status: "rejected" }])).toEqual([]);
  });

  it("單向修復：不會把 listed 降級成 candidate", () => {
    const products = [{ zh_name: "停售商品", brand: null, status: "pending_review" }];
    const entities = [{ id: "e1", canonical_name: "停售商品", brand: null, status: "listed" }];
    expect(planStatusRepairs(products, entities)).toEqual([]);
  });

  it("去重鍵以 canonical_name + brand 組成（與 unique 條件一致）", () => {
    expect(entityKey(" A ", " B ")).toBe("A|B");
    expect(entityKey(null, undefined)).toBe("|");
  });
});
