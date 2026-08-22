import { listOrders, getOrder, maskIdNumber, updateOrderStatus } from "@/lib/orders";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "awaiting_payment", "paid", "purchasing", "shipped_from_japan", "customs_clearance", "taiwan_received", "shipped_to_customer", "completed", "cancelled", "customs_problem"];

export default function AdminOrders() {
  const orders = listOrders();

  async function changeStatus(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    const status = String(formData.get("status"));
    updateOrderStatus(id, status as any);
    redirect("/admin/orders");
  }

  return (
    <div>
      <a href="/admin" className="text-sm text-gray-500">← 後台</a>
      <h1 className="mt-2 text-2xl font-extrabold">訂單管理</h1>
      <a href="/api/export" className="btn btn-primary mt-3">匯出 CSV</a>

      <div className="mt-4 space-y-3">
        {orders.length === 0 ? <p className="text-gray-500">尚無訂單。</p> : null}
        {orders.map((o) => {
          const full = getOrder(o.id);
          return (
            <div key={o.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-extrabold">{o.order_number}</span>
                <span className="text-sm text-gray-500">{o.status}</span>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                收件人：{full?.customer?.name} · 總額 NT${o.total_amount}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                報關身分證：<span className="font-mono">{maskIdNumber(full?.customs?.id_number || "")}</span>
              </div>
              <form action={changeStatus} className="mt-3 flex items-center gap-2">
                <input type="hidden" name="id" value={o.id} />
                <select name="status" className="input" defaultValue={o.status}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="btn btn-primary">更新狀態</button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
