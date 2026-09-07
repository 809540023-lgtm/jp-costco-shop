"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PairingReviewRow } from "@/lib/onsite-review";

function yen(v: number | null) {
  return v == null ? null : `¥${Math.round(v).toLocaleString()}`;
}

function CandidateBadges({ candidate }: { candidate: PairingReviewRow["productPhoto"] | null }) {
  if (!candidate?.candidate) return null;
  const c = candidate.candidate;
  return (
    <div className="mt-1 flex flex-wrap gap-1 text-xs">
      {c.productName ? <span className="rounded bg-gray-100 px-2 py-0.5">{c.productName}</span> : null}
      {c.costcoItemNumber ? <span className="rounded bg-gray-100 px-2 py-0.5">Item {c.costcoItemNumber}</span> : null}
      {c.jan ? <span className="rounded bg-gray-100 px-2 py-0.5">JAN {c.jan}</span> : null}
      {c.saleEvidence ? <span className="rounded bg-red-50 px-2 py-0.5 text-red-700">{yen(c.salePriceJpy) ?? yen(c.observedPriceJpy)}｜{c.saleEvidence}</span> : yen(c.observedPriceJpy) != null ? <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">{yen(c.observedPriceJpy)}</span> : null}
    </div>
  );
}

function PhotoCell({ photo, emoji }: { photo: PairingReviewRow["productPhoto"]; emoji: string }) {
  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-lg bg-gray-100">
        {photo?.url ? <img src={photo.url} alt="現場照片" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl">{emoji}</div>}
      </div>
      <CandidateBadges candidate={photo} />
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  NEEDS_REVIEW: "bg-amber-100 text-amber-800",
  VERIFIED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700"
};

export default function PairingReviewList({ pairings }: { pairings: PairingReviewRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function review(id: number, status: "VERIFIED" | "REJECTED") {
    setBusyId(id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/onsite/pairings/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "審核失敗");
      setMessage(`配對 #${id} 已標記 ${status === "VERIFIED" ? "配對正確" : "配對錯誤"}。`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "審核失敗");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-extrabold">🏷️ 待審配對（回看原圖確認）</h2>
      <p className="mt-1 text-xs text-gray-500">確認商品照與價牌照屬同一商品後標記配對正確；正確配對才可產生特價草稿。</p>
      {message ? <p className="mt-2 text-sm text-gray-700">{message}</p> : null}
      {pairings.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">目前沒有待審配對。</p>
      ) : (
        <div className="mt-3 grid gap-3">
          {pairings.map((p) => (
            <div key={p.id} className={`rounded-xl border p-3 ${p.status === "NEEDS_REVIEW" ? "border-amber-300 bg-amber-50/40" : "opacity-60"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[p.status] ?? "bg-gray-100"}`}>
                  {p.status === "NEEDS_REVIEW" ? "待審" : p.status === "VERIFIED" ? "已確認" : "已退回"}
                </span>
                <span className="text-xs text-gray-500">評分 {p.score ?? "—"}｜{p.evidence.slice(0, 2).join("・") || p.method}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <PhotoCell photo={p.productPhoto} emoji="🛍️" />
                <PhotoCell photo={p.tagPhoto} emoji="🏷️" />
              </div>
              {p.status === "NEEDS_REVIEW" ? (
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busyId === p.id} onClick={() => review(p.id, "VERIFIED")}
                    className="flex-1 rounded-xl bg-green-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                    {busyId === p.id ? "處理中…" : "✅ 配對正確"}
                  </button>
                  <button type="button" disabled={busyId === p.id} onClick={() => review(p.id, "REJECTED")}
                    className="flex-1 rounded-xl bg-gray-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                    ❌ 配對錯誤
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}