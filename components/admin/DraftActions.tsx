"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  draftId: string;
  status: string;
  scheduledFor: string | null;
}

// Agent 5 草稿操作：一鍵核准發布（沿用 2.0 publish 流程）／核准並排程／取消排程。
// 依專案規範使用 Route Handler + router.refresh()，不用 Server Action redirect。
export default function DraftActions({ draftId, status, scheduledFor }: Props) {
  const router = useRouter();
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(url: string, body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || `失敗（${res.status}）`);
      } else {
        setMsg(okMsg);
        router.refresh();
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {status === "approved" && scheduledFor ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            ⏰ 排程：{new Date(scheduledFor).toLocaleString("zh-TW")}
          </span>
          <button
            disabled={busy}
            onClick={() => post("/api/admin/drafts/schedule", { draftId, cancel: true }, "已取消排程")}
            className="btn btn-ghost text-sm"
          >
            取消排程
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() => post("/api/admin/drafts/publish", { draftId }, "已發布本期商品")}
          className="btn btn-primary"
        >
          {status === "approved" ? "立即發布" : "核准並發布"}
        </button>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          disabled={busy || !when}
          onClick={() =>
            post(
              "/api/admin/drafts/schedule",
              { draftId, scheduledFor: new Date(when).toISOString() },
              "已核准並排程"
            )
          }
          className="btn btn-ghost"
        >
          排程發布
        </button>
      </div>
      {msg ? <p className="text-xs text-gray-500">{msg}</p> : null}
    </div>
  );
}