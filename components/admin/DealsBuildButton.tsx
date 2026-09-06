"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DealBuildResult {
  pairingsConsidered: number;
  dealsCreated: number;
  dealsUpdated: number;
  skippedAlreadyLinked: number;
  skippedPublished: number;
  skippedMissingPhoto: number;
}

export default function DealsBuildButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function buildDeals() {
    setRunning(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/onsite/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 50 })
      });
      const data = (await response.json()) as { result?: DealBuildResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "特價草稿產生失敗");
      const r = data.result;
      setMessage(
        `已確認配對 ${r.pairingsConsidered} 組：新增特價草稿 ${r.dealsCreated}、更新草稿 ${r.dealsUpdated}；` +
        `略過（已連結 ${r.skippedAlreadyLinked}、已發布 ${r.skippedPublished}、缺少照片 ${r.skippedMissingPhoto}）。` +
        `草稿一律待人工確認譯名與發布。`
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "特價草稿產生失敗");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border bg-white p-5">
      <button
        type="button"
        onClick={buildDeals}
        disabled={running}
        className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50"
      >
        {running ? "產生中…" : "已確認配對 → 產生特價草稿"}
      </button>
      <p className="mt-2 text-xs text-gray-500">只處理人工 VERIFIED 的配對；產出為 draft／UNVERIFIED，發布前需人工補中文譯名。</p>
      {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}
    </div>
  );
}