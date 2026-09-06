// 模型路由（SPEC 模型使用原則）：便宜模型/程式做一般工作，Astra 只做五種高價值推理。
// 未設定金鑰時一律回 null，呼叫端自動降級為規則引擎 → 系統永遠可運作。
export type LlmTask = "entity_matching" | "intent" | "video_understanding" | "suitability" | "procurement_decision";

const ASTRA_ENDPOINT = process.env.ASTRA_ENDPOINT; // OpenAI 相容 chat completions endpoint
const ASTRA_API_KEY = process.env.ASTRA_API_KEY;
const ASTRA_MODEL = process.env.ASTRA_MODEL || "astra";
const SOL_ENDPOINT = process.env.SOL_ENDPOINT || ASTRA_ENDPOINT;
const SOL_API_KEY = process.env.SOL_API_KEY || ASTRA_API_KEY;
const SOL_MODEL = process.env.SOL_MODEL || "sol";

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
}