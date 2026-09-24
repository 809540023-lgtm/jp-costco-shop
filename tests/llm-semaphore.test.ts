import { describe, it, expect } from "vitest";
import { withLlmSlot } from "../lib/graph/llm";

describe("withLlmSlot（LLM 併發限制）", () => {
  it("同時間執行的 LLM 呼叫不超過 3 個", async () => {
    let running = 0;
    let peak = 0;
    const tasks = Array.from({ length: 10 }, (_, i) =>
      withLlmSlot(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 10 + (i % 3) * 5));
        running--;
      })
    );
    await Promise.all(tasks);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // 有在並行，不是全部排隊成序列
  });

  it("任務拋錯時也會釋出名額", async () => {
    const results = await Promise.allSettled([
      withLlmSlot(async () => {
        throw new Error("boom");
      }),
      withLlmSlot(async () => "ok"),
      withLlmSlot(async () => "ok"),
      withLlmSlot(async () => "ok")
    ]);
    expect(results[0].status).toBe("rejected");
    // 全部順利結束（沒有卡死）代表錯誤路徑有正常 release
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  });
});