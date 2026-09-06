"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface VisionBatchResult {
  selected: number;
  recognized: number;
  contextOnly: number;
  failed: number;
  skipped: boolean;
  reason?: string;
}

interface PairingBatchResult {
  productsConsidered: number;
  tagsConsidered: number;
  proposals: number;
  pairedPhotos: number;
}

export default function VisionRunButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function runVision() {
    setRunning(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/onsite/vision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 10 })
      });
      const result = (await response.json()) as { vision: VisionBatchResult; pairing: PairingBatchResult; error?: string };
      if (!response.ok) throw new Error(result.error || "Vision 處理失敗");
      if (result.vision.skipped) {
        setMessage(`已跳過：${result.vision.reason}。設定 VISION_*（或 ASTRA_*）環境變數後即可自動辨識。`);
      } else {
        setMessage(`辨識 ${result.vision.selected} 張：商品 ${result.vision.recognized}、情境照 ${result.vision.contextOnly}、失敗 ${result.vision.failed}；配對候選 ${result.pairing.proposals} 組。全部為候選資料，待人工確認。`);
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vision 處理失敗");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border bg-white p-5">
      <button
        type="button"
        onClick={runVision}
        disabled={running}
        className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white disabled:opacity-50"
      >
        {running ? "辨識中…" : "執行 Vision 辨識＋配對（10 張）"}
      </button>
      <p className="mt-2 text-xs text-gray-500">辨識結果一律為候選資料（CANDIDATE），需回看原圖確認後才可 VERIFIED／發布。</p>
      {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}
    </div>
  );
}