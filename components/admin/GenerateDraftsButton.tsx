"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Agent 5 自動文案手動觸發（每日 cron run-agents 也會自動執行）
export default function GenerateDraftsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/drafts/generate", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(data.error || `失敗（${res.status}）`);
      else setMsg(`新增 ${data.generated} 筆草稿（潤稿 ${data.polished}，略過 ${data.skippedExisting}）`);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={onClick} disabled={busy} className="btn btn-primary">
        {busy ? "產生中…" : "🤖 產生自動文案"}
      </button>
      {msg ? <span className="text-sm text-gray-500">{msg}</span> : null}
    </div>
  );
}