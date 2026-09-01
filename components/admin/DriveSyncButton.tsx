"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SyncResult {
  total: number;
  images: number;
  videos: number;
  newFiles: number;
  updatedFiles: number;
  existingFiles: number;
}

export default function DriveSyncButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function runSync() {
    setRunning(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/onsite/sync", { method: "POST" });
      const result = (await response.json()) as SyncResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "同步失敗");
      setMessage(
        `完整掃描 ${result.total} 個檔案：${result.images} 張圖片、${result.videos} 支影片；新增 ${result.newFiles}、更新 ${result.updatedFiles}、既有 ${result.existingFiles}。`
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步失敗");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border bg-white p-5">
      <button
        type="button"
        onClick={runSync}
        disabled={running}
        className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50"
      >
        {running ? "同步中…" : "同步 Google Drive 全部檔案"}
      </button>
      {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}
    </div>
  );
}
