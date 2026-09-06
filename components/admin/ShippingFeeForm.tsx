"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const GATE_LABELS: Record<string, string> = {
  pending: "待確認運費",
  confirmed: "運費已確認（待客戶補款）",
  paid: "運費已付款"
};

// Agent 6 運費人工閘門表單：輸入實際國際運費 → 確認 → 客戶補款後關閉閘門。
export default function ShippingFeeForm({ orderId, gateStatus }: { orderId: string; gateStatus: string }) {
  const router = useRouter();
  const [fee, setFee] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/orders/shipping-fee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "更新失敗");
      return;
    }
    setMsg(`已更新為 ${data.status}${data.totalAmount != null ? `，應付總額 NT$${Math.round(data.totalAmount).toLocaleString()}` : ""}`);
    router.refresh();
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = Number(fee);
    if (!Number.isFinite(v) || v < 0) {
      setMsg("請輸入有效的運費金額");
      return;
    }
    post({ id: orderId, shippingFee: v });
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="text-sm font-bold">
        🚚 運費人工閘門：<span className="ml-1">{GATE_LABELS[gateStatus] || gateStatus}</span>
      </div>
      {gateStatus !== "paid" ? (
        <form onSubmit={onSubmit} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className="input w-36"
            inputMode="decimal"
            placeholder="實際國際運費"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy}>
            {gateStatus === "pending" ? "確認運費" : "修改運費"}
          </button>
          {gateStatus === "confirmed" ? (
            <button type="button" className="btn" disabled={busy} onClick={() => post({ id: orderId, paid: true })}>
              客戶已補款
            </button>
          ) : null}
        </form>
      ) : (
        <div className="mt-1 text-sm text-gray-500">閘門已關閉（paid），可進入採購／出貨流程。</div>
      )}
      {msg ? <div className="mt-2 text-sm text-gray-600">{msg}</div> : null}
    </div>
  );
}