"use client";
import { useState } from "react";

// 自動採購清單 → LINE 通知管理員（未設定 LINE token 時顯示提示）。
export default function ProcurementNotifyButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function notify() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/procurement", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? (data.sent ? `已發送 LINE 採購清單（${data.totalItems} 件）` : data.reason || "目前無待採購商品") : data.error || "發送失敗");
  }

  return (
    <div className="mt-4">
      <button className="btn btn-primary" onClick={notify} disabled={busy}>
        📢 傳送採購清單到 LINE
      </button>
      {msg ? <div className="mt-2 text-sm text-gray-600">{msg}</div> : null}
    </div>
  );
}