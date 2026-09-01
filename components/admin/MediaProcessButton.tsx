"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ProcessResult {
  selected: number;
  processed: number;
  failed: number;
  assets: number;
  error?: string;
}

export default function MediaProcessButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function runProcess() {
    setRunning(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/onsite/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 10 })
      });
      const result = (await response.json()) as ProcessResult;
      if (!response.ok) throw new Error(result.error || "媒體處理失敗");
      setMessage(`選取 ${result.selected} 個檔案，成功 ${result.processed}、失敗 ${result.failed}，產生 ${result.assets} 個私有媒體檔。`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "媒體處理失敗");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border bg-white p-5">
      <button
        type="button"
        onClick={runProcess}
        disabled={running}
        className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-white disabled:opacity-50"
      >
        {running ? "處理中…" : "處理下一批 HEIC／MOV（10 個）"}
      </button>
      {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}
    </div>
  );
}
