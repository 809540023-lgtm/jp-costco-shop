// 3.0 門檻與權重設定：全部集中於此，可用環境變數覆寫，不寫死在程式碼。
// 對應 SPEC 第 5.2 / 6.2 / 7.2 / 8.3 節。

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const graphConfig = {
  // Agent 1 Reseller Promotion Signal 權重（合計 100）
  reseller: {
    wRecent7d: num("RESELLER_W_RECENT7D", 40),
    wDistinctAccounts: num("RESELLER_W_ACCOUNTS", 25),
    wEngagement: num("RESELLER_W_ENGAGEMENT", 20),
    wAcceleration: num("RESELLER_W_ACCELERATION", 15),
    logK: num("RESELLER_LOG_K", 10) // 對數尺度：score = 100 * ln(1+v)/ln(1+K*v)
  },
  // Agent 2 購買意圖權重（SPEC 6.1 表）
  intent: {
    weights: {
      want_buy: 10,
      asking_daigou: 10,
      asking_price: 9,
      asking_where: 9,
      positive_review: 6,
      neutral: 3,
      like_only: 1,
      negative: -5,
      exists_tw: -15
    } as Record<string, number>,
    windowDays: num("INTENT_WINDOW_DAYS", 30),
    threshold: num("INTENT_THRESHOLD", 50)
  },
  // Agent 3 適合度門檻（SPEC 7.2）
  suitability: {
    threshold: num("SUITABILITY_THRESHOLD", 40),
    fitThreshold: num("SUITABILITY_FIT_THRESHOLD", 65)
  },
  // Agent 4 決策映射（SPEC 8.3）
  decision: {
    weeklyPick: num("DECISION_WEEKLY_PICK", 85),
    list: num("DECISION_LIST", 70),
    observe: num("DECISION_OBSERVE", 55)
  },
  // Agent 6 運費閘門
  shippingGate: { statuses: ["pending", "confirmed", "paid"] as const }
};

export type GraphConfig = typeof graphConfig;