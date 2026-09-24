import { describe, it, expect } from "vitest";
import {
  draftInputFromRow,
  sellingPointEvidenceFromReasons,
  applySolPolish
} from "../lib/graph/content";
import { buildListingDraft } from "../lib/graph/listing-draft";
import { collectionIdFor, isDraftDue, validateScheduledFor } from "../lib/publish";

const row = {
  id: "e1",
  canonical_name: "カボチャの種",
  canonical_name_jp: "南瓜籽",
  brand: "Kirkland",
  category: "堅果",
  status: "weekly_pick",
  latestPriceJpy: 998,
  latestTwPriceTwd: 450,
  reasons: null
};

describe("Agent 5 自動文案", () => {
  it("score_snapshot.reasons 陣列形式 → 取 evidence（level>=3 優先）", () => {
    const reasons = [
      { factor: "價差", level: 5, evidence: "台灣售價為日本 2 倍" },
      { factor: "需求", level: 2, evidence: "有詢問" },
      { factor: "競業", level: 4, evidence: "多個代購在賣" }
    ];
    expect(sellingPointEvidenceFromReasons(reasons)).toEqual([
      "台灣售價為日本 2 倍",
      "多個代購在賣",
      "有詢問"
    ]);
  });

  it("score_snapshot.reasons 物件（數字鍵）形式（pipeline 儲存格式）→ 一樣取 evidence", () => {
    const reasons = {
      0: { factor: "價差", level: 5, evidence: "價差明顯" },
      comment: "整體值得上架",
      reseller: { score: 80 }
    };
    expect(sellingPointEvidenceFromReasons(reasons)).toEqual(["價差明顯"]);
  });

  it("缺漏／錯誤格式 → 回傳空陣列，不爆炸", () => {
    expect(sellingPointEvidenceFromReasons(null)).toEqual([]);
    expect(sellingPointEvidenceFromReasons("x")).toEqual([]);
    expect(sellingPointEvidenceFromReasons({ a: 1 })).toEqual([]);
  });

  it("草稿輸入映射：Graph 資料 → 模板輸入；promo 不憑空產生", () => {
    const input = draftInputFromRow({ ...row, reasons: [{ level: 5, evidence: "價差大" }] });
    expect(input.canonicalName).toBe(row.canonical_name);
    expect(input.costcoPriceJpy).toBe(998);
    expect(input.sellingPointEvidence).toEqual(["價差大"]);
    expect(input.promoText).toBeNull();

    const draft = buildListingDraft(input);
    expect(draft.titleTw).toContain("Kirkland");
    expect(draft.titleTw).toContain("日本Costco代購");
    expect(draft.promoText).toBeNull();
  });

  it("Sol 潤稿：有效欄位覆寫、其餘保留模板", () => {
    const draft = buildListingDraft(draftInputFromRow(row));
    const polished = applySolPolish(draft, {
      title_tw: "  自訂標題  ",
      description_tw: "自訂描述",
      social_captions: { line: "LINE 文案" }
    });
    expect(polished.titleTw).toBe("自訂標題");
    expect(polished.descriptionTw).toBe("自訂描述");
    expect(polished.socialCaptions.line).toBe("LINE 文案");
    expect(polished.socialCaptions.instagram).toBe(draft.socialCaptions.instagram);
    expect(polished.seo).toEqual(draft.seo);
  });

  it("Sol 潤稿：格式不符／空白值 → 保留模板草稿", () => {
    const draft = buildListingDraft(draftInputFromRow(row));
    expect(applySolPolish(draft, null)).toEqual(draft);
    expect(applySolPolish(draft, "x" as never)).toEqual(draft);
    expect(applySolPolish(draft, { title_tw: "   " }).titleTw).toBe(draft.titleTw);
    expect(applySolPolish(draft, { title_tw: 123 as never }).titleTw).toBe(draft.titleTw);
  });
});

describe("Agent 5 排程發布", () => {
  const now = new Date("2026-09-07T08:00:00Z");

  it("collection id 沿用 2.0 格式", () => {
    expect(collectionIdFor("2026-09-07", 3)).toBe("2026-09-07-costco-japan-top3");
  });

  it("到期判斷：已核准且時間已到", () => {
    expect(isDraftDue({ publish_status: "approved", scheduled_for: "2026-09-07T07:59:00Z" }, now)).toBe(true);
  });
  it("未核准、未排程、未到期 → 不發布", () => {
    expect(isDraftDue({ publish_status: "draft", scheduled_for: "2026-09-07T07:00:00Z" }, now)).toBe(false);
    expect(isDraftDue({ publish_status: "approved", scheduled_for: null }, now)).toBe(false);
    expect(isDraftDue({ publish_status: "approved", scheduled_for: "2026-09-07T09:00:00Z" }, now)).toBe(false);
  });

  it("排程時間驗證：未來可、過去拒", () => {
    expect(validateScheduledFor("2026-09-07T09:00:00Z", now)).toBe("2026-09-07T09:00:00.000Z");
    expect(validateScheduledFor(now.toISOString(), now)).toBe(now.toISOString()); // 1 分鐘誤差內允許
    expect(validateScheduledFor("2026-09-07T00:00:00Z", now)).toBeNull();
    expect(validateScheduledFor("not-a-date", now)).toBeNull();
    expect(validateScheduledFor("", now)).toBeNull();
    expect(validateScheduledFor(123, now)).toBeNull();
  });
});