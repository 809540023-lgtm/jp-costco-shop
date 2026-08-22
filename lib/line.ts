// LINE 銜接。
// 第一階段：提供可放在 LINE 官方帳號的網站網址（不需 API）。
// 第二階段：串接 LINE Messaging API（需 LINE_CHANNEL_ACCESS_TOKEN 等環境變數）。
// 安全：身分證字號不可直接傳送到 LINE。

export const LINE_PHASE = process.env.LINE_PHASE || "1";

export function shopUrl(path = "/costco") {
  const base = process.env.SITE_URL || "https://your-site.onrender.com";
  return `${base}${path}`;
}

// 第二階段：發送 LINE 訊息（需設定環境變數後才可用）。
export async function sendLineMessage(to: string, text: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn("未設定 LINE_CHANNEL_ACCESS_TOKEN，略過 LINE 通知。");
    return false;
  }
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] })
  });
  return res.ok;
}

// 通知管理員（新訂單、搜尋失敗等）。身分證字號不在此傳送。
export async function notifyAdmin(text: string) {
  const adminId = process.env.LINE_ADMIN_ID;
  if (!adminId) return false;
  return sendLineMessage(adminId, text);
}
