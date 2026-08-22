"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUSES = ["pending", "awaiting_payment", "paid", "purchasing", "shipped_from_japan", "customs_clearance", "taiwan_received", "shipped_to_customer", "completed", "cancelled", "customs_problem"];

export default function StatusForm({ orderId, current }: { orderId: string; current: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(current);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await fetch("/api/admin/orders/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status })
    });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex items-center gap-2">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <button className="btn btn-primary">更新狀態</button>
    </form>
  );
}
