"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DraftDealReviewRow } from "@/lib/onsite-review";

function yen(v: number | null) {
  return v == null ? null : `¥${Math.round(v).toLocaleString()}`;
}

export default function DraftDealsReview({ drafts }: { drafts: DraftDealReviewRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function save(deal: DraftDealReviewRow, form: Record<string, string>, publish: boolean) {
    setBusyId(deal.id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/onsite/deals/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: deal.id, publish, ...form })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "更新失敗");
      setMessage(publish ? `「${form.product_name_zh || deal.product_name_zh}」已發布到 /costco/deals。` : "草稿已儲存。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新失敗");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-extrabold">📝 特價草稿（補中文譯名後發布）</h2>
      <p className="mt-1 text-xs text-gray-500">草稿來自已確認配對；發布後顯示於前台 /costco/deals，已發布不可再修改。</p>
      {message ? <p className="mt-2 text-sm text-gray-700">{message}</p> : null}
      {drafts.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">目前沒有特價草稿。</p>
      ) : (
        <div className="mt-3 grid gap-3">
          {drafts.map((d) => (
            <DraftCard key={d.id} deal={d} busy={busyId === d.id} onSave={save} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraftCard({
  deal, busy, onSave
}: {
  deal: DraftDealReviewRow;
  busy: boolean;
  onSave: (deal: DraftDealReviewRow, form: Record<string, string>, publish: boolean) => void;
}) {
  const [form, setForm] = useState({
    product_name_zh: deal.product_name_zh ?? "",
    sale_price_jpy: deal.sale_price_jpy?.toString() ?? "",
    regular_price_jpy: deal.regular_price_jpy?.toString() ?? "",
    sale_end_date: deal.sale_end_date ?? ""
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="rounded-xl border p-3">
      <div className="grid grid-cols-2 gap-3">
        {[deal.primaryPhotoUrl, deal.priceTagPhotoUrl].map((src, i) => (
          <div key={i} className="aspect-square overflow-hidden rounded-lg bg-gray-100">
            {src ? <img src={src} alt={i === 0 ? deal.product_name_ja : "現場價牌"} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl">{i === 0 ? "🛍️" : "🏷️"}</div>}
          </div>
        ))}
      </div>
      <div className="mt-2 text-sm">
        <div className="font-bold">{deal.product_name_ja}</div>
        <div className="mt-0.5 text-xs text-gray-500">
          {deal.costco_item_number ? `Item ${deal.costco_item_number}｜` : ""}
          原價 {yen(deal.regular_price_jpy) ?? "—"}｜現場 {yen(deal.sale_price_jpy ?? deal.regular_price_jpy) ?? "—"}
          {deal.ai_confidence != null ? `｜AI 信心 ${Math.round(deal.ai_confidence * 100)}%` : ""}
        </div>
        <div className="mt-1 rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">{deal.ai_description}</div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <label className="col-span-2">
          <span className="text-xs text-gray-500">中文譯名（發布必填）</span>
          <input value={form.product_name_zh} onChange={set("product_name_zh")} placeholder="例：仙貝禮盒"
            className="mt-0.5 w-full rounded-lg border px-2 py-1.5" />
        </label>
        <label>
          <span className="text-xs text-gray-500">現場價格</span>
          <input value={form.sale_price_jpy} onChange={set("sale_price_jpy")} inputMode="numeric"
            className="mt-0.5 w-full rounded-lg border px-2 py-1.5" />
        </label>
        <label>
          <span className="text-xs text-gray-500">原價（特價證據時）</span>
          <input value={form.regular_price_jpy} onChange={set("regular_price_jpy")} inputMode="numeric"
            className="mt-0.5 w-full rounded-lg border px-2 py-1.5" />
        </label>
        <label>
          <span className="text-xs text-gray-500">特價期限</span>
          <input value={form.sale_end_date} onChange={set("sale_end_date")} type="date"
            className="mt-0.5 w-full rounded-lg border px-2 py-1.5" />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => onSave(deal, form, false)}
          className="rounded-xl border px-3 py-2 text-sm font-bold text-gray-700 disabled:opacity-50">
          {busy ? "處理中…" : "儲存草稿"}
        </button>
        <button type="button" disabled={busy} onClick={() => onSave(deal, form, true)}
          className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
          🚀 發布到前台
        </button>
      </div>
    </div>
  );
}