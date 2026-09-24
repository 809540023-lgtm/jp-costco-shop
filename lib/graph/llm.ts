// 模型路由（SPEC 模型使用原則）：便宜模型/程式做一般工作，Astra 只做五種高價值推理。
// 未設定金鑰時一律回 null，呼叫端自動降級為規則引擎 → 系統永遠可運作。
export type LlmTask = "entity_matching" | "intent" | "video_understanding" | "suitability" | "procurement_decision" | "content_copy";

const ASTRA_ENDPOINT = process.env.ASTRA_ENDPOINT; // OpenAI 相容 chat completions endpoint
const ASTRA_API_KEY = process.env.ASTRA_API_KEY;
const ASTRA_MODEL = process.env.ASTRA_MODEL || "astra";
const SOL_ENDPOINT = process.env.SOL_ENDPOINT || ASTRA_ENDPOINT;
const SOL_API_KEY = process.env.SOL_API_KEY || ASTRA_API_KEY;
const SOL_MODEL = process.env.SOL_MODEL || "sol";

// 併發限制：同時間最多 N 個 Agent 呼叫 LLM（預設 3，可用 LLM_MAX_CONCURRENCY 覆寫），
// 避免每日管線（實體比對＋意圖升級＋決策＋文案潤稿）一次打爆 endpoint 或超用額度。
export class Semaphore {
  private available: number;
  private waiters: Array<() => void> = [];
  constructor(limit: number) {
    if (!Number.isFinite(limit) || limit < 1) throw new Error("Semaphore limit 必須 ≥ 1");
    this.available = Math.floor(limit);
  }
  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }
  release(): void {
    const next = this.waiters.shift();
    if (next) next(); // 名額直接交接給佇列中的下一個，不重複計數
    else this.available++;
  }
}

const llmSemaphore = new Semaphore(Number(process.env.LLM_MAX_CONCURRENCY || "3"));

export async function withLlmSlot<T>(fn: () => Promise<T>): Promise<T> {
  await llmSemaphore.acquire();
  try {
    return await fn();
  } finally {
    llmSemaphore.release();
  }
}

export function isAstraConfigured(): boolean {
  return Boolean(ASTRA_ENDPOINT && ASTRA_API_KEY);
}

export function isSolConfigured(): boolean {
  return Boolean(SOL_ENDPOINT && SOL_API_KEY);
}

export async function callLlm(
  task: LlmTask,
  systemPrompt: string,
  userPrompt: string,
  opts?: { json?: boolean }
): Promise<{ model: string; content: string } | null> {
  const useAstra = task === "entity_matching" || task === "intent" ||
    task === "video_understanding" || task === "suitability" || task === "procurement_decision";
  const endpoint = useAstra ? ASTRA_ENDPOINT : SOL_ENDPOINT;
  const apiKey = useAstra ? ASTRA_API_KEY : SOL_API_KEY;
  const model = useAstra ? ASTRA_MODEL : SOL_MODEL;
  if (!endpoint || !apiKey) return null;
  return withLlmSlot(async () => {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2,
          ...(opts?.json ? { response_format: { type: "json_object" } } : {})
        })
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      return content ? { model, content } : null;
    } catch {
      return null;
    }
  });
}

// Vision（圖片理解）：優先專用 VISION_*，未設定沿用 Astra。
// OpenAI 相容 chat completions，image_url 內容。
const VISION_ENDPOINT = process.env.VISION_ENDPOINT || ASTRA_ENDPOINT;
const VISION_API_KEY = process.env.VISION_API_KEY || ASTRA_API_KEY;
const VISION_MODEL = process.env.VISION_MODEL || ASTRA_MODEL || "vision";

export async function callVision(
  systemPrompt: string,
  userPrompt: string,
  imageUrl: string
): Promise<{ model: string; content: string } | null> {
  if (!VISION_ENDPOINT || !VISION_API_KEY) return null;
  try {
    const response = await fetch(VISION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${VISION_API_KEY}` },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        temperature: 0.1
      })
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    return content ? { model: VISION_MODEL, content } : null;
  } catch {
    return null;
  }
}