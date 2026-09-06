import { describe, it, expect } from "vitest";
import { classifyComment, intentScore } from "../lib/graph/intent-classifier";
import { resellerSignal } from "../lib/graph/reseller-signal";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

describe("Agent 2 意圖分類", () => {
  it("明確想買 → want_buy（權重 10）", () => {
    const r = classifyComment("好想買這個！");
    expect(r.intentClass).toBe("want_buy");
    expect(r.weight).toBe(10);
  });
  it("求代購 → asking_daigou", () => {
    expect(classifyComment("有人可以代購嗎").intentClass).toBe("asking_daigou");
  });
  it("詢價 → asking_price（權重 9）", () => {
    expect(classifyComment("請問這多少錢？").intentClass).toBe("asking_price");
  });
  it("「台灣就有」為大幅扣分訊號 exists_tw（-15，優先級最高）", () => {
    const r = classifyComment("全聯就有了吧 想買");
    expect(r.intentClass).toBe("exists_tw");
    expect(r.weight).toBe(-15);
  });
  it("負評 → negative（-5）", () => {
    expect(classifyComment("買過一次很後悔，不好吃").intentClass).toBe("negative");
  });
  it("正面心得 → positive_review（6）", () => {
    expect(classifyComment("上次買過很好用").intentClass).toBe("positive_review");
  });
  it("單純表情符號 → like_only（1）", () => {
    expect(classifyComment("❤️❤️❤️").intentClass).toBe("like_only");
  });
  it("空字串 → like_only", () => {
    expect(classifyComment("").intentClass).toBe("like_only");
  });
});

describe("Agent 2 intent_score", () => {
  it("無訊號 → 0 分", () => {
    expect(intentScore([])).toBe(0);
  });
  it("高意圖留言量 → 分數上升且介於 0-100", () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      intentClass: "want_buy",
      intentWeight: 10,
      createdAt: daysAgo(i % 10)
    }));
    const score = intentScore(events);
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });
  it("扣分訊號（exists_tw/negative）會壓低分數", () => {
    const good = [{ intentClass: "want_buy", intentWeight: 10, createdAt: daysAgo(1) }];
    const bad = [
      { intentClass: "want_buy", intentWeight: 10, createdAt: daysAgo(1) },
      { intentClass: "exists_tw", intentWeight: -15, createdAt: daysAgo(1) },
      { intentClass: "exists_tw", intentWeight: -15, createdAt: daysAgo(2) }
    ];
    expect(intentScore(bad)).toBeLessThan(intentScore(good));
  });
  it("超過 30 天的訊號不計入", () => {
    const old = [{ intentClass: "want_buy", intentWeight: 10, createdAt: daysAgo(40) }];
    expect(intentScore(old)).toBe(0);
  });
});

describe("Agent 1 reseller_signal", () => {
  const mention = (i: number, key: string, views = 1000, first = false) => ({
    resellerKey: key,
    platform: "youtube",
    isFirstMention: first,
    engagement: { views },
    mentionedAt: daysAgo(i)
  });
  it("無提及 → 0 分", () => {
    expect(resellerSignal([]).score).toBe(0);
  });
  it("多業者近期密集推廣 → 高分", () => {
    const mentions = [];
    for (let d = 0; d < 7; d += 1) {
      for (let a = 0; a < 5; a += 1) {
        mentions.push(mention(d, `r${a}`, 20000, d === 0));
      }
    }
    const s = resellerSignal(mentions);
    expect(s.score).toBeGreaterThan(60);
    expect(s.distinctAccounts7d).toBe(5);
    expect(s.mentions7d).toBe(35);
  });
  it("只有 90 天前舊提及 → 低分", () => {
    const s = resellerSignal([mention(80, "r1"), mention(85, "r2")]);
    expect(s.score).toBeLessThan(30);
    expect(s.mentions7d).toBe(0);
  });
});