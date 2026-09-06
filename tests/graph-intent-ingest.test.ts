import { describe, it, expect } from "vitest";
import { classifyCommentWithUpgrade, LlmIntentFn } from "../lib/graph/intent-ingest";
import { IntentClass } from "../lib/graph/intent-classifier";

describe("Agent 2 模糊案例升級 AI（規則先行）", () => {
  it("規則明確類別（want_buy）直接採用，不呼叫 AI", async () => {
    let called = 0;
    const llmFn: LlmIntentFn = async () => {
      called += 1;
      return "asking_price";
    };
    const r = await classifyCommentWithUpgrade("好想買這個！", llmFn);
    expect(called).toBe(0);
    expect(r.intentClass).toBe("want_buy");
    expect(r.classifiedBy).toBe("rule");
    expect(r.weight).toBe(10);
  });

  it("模糊案例（neutral）+ AI 判為 asking_price → 升級 AI 權重 9", async () => {
    const llmFn: LlmIntentFn = async () => "asking_price";
    const r = await classifyCommentWithUpgrade("這個可以吃嗎", llmFn);
    expect(r.intentClass).toBe("asking_price");
    expect(r.weight).toBe(9);
    expect(r.classifiedBy).toBe("ai");
  });

  it("AI 回傳不合法類別 → 降級規則結果", async () => {
    const llmFn = async () => "bogus" as IntentClass;
    const r = await classifyCommentWithUpgrade("這個可以吃嗎", llmFn);
    expect(r.intentClass).toBe("neutral");
    expect(r.classifiedBy).toBe("rule");
    expect(r.weight).toBe(3);
  });

  it("AI 回傳 null（金鑰未設定）→ 降級規則結果", async () => {
    const r = await classifyCommentWithUpgrade("這個可以吃嗎", async () => null);
    expect(r.intentClass).toBe("neutral");
    expect(r.classifiedBy).toBe("rule");
  });

  it("AI 拋錯 → 降級規則結果，不阻塞", async () => {
    const r = await classifyCommentWithUpgrade("這個可以吃嗎", async () => {
      throw new Error("network down");
    });
    expect(r.intentClass).toBe("neutral");
    expect(r.classifiedBy).toBe("rule");
  });
});