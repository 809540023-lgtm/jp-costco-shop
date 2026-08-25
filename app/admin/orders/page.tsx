import { listOrders, getOrder, maskIdNumber } from "@/lib/orders";
import { requireAdmin } from "@/lib/auth";
import StatusForm from "@/components/admin/StatusForm";

export const dynamic = "force-dynamic";

export default async function AdminOrders() {
  await requireAdmin();
  const orders = await listOrders();
  const fulls = await Promise.all(orders.map((o) => getOrder(o.id)));

  return (
    <div>
      <a href="/admin" className="text-sm text-gray-500">← 後台</a>
      <h1 className="mt-2 text-2xl font-extrabold">訂單管理</h1>
      <a href="/api/export" className="btn btn-primary mt-3">匯出 CSV</a>

      <div className="mt-4 space-y-3">
        {orders.length === 0 ? <p className="text-gray-500">尚無訂單。</p> : null}
        {orders.map((o, idx) => {
          const full = fulls[idx];
          return (            <div key={o.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-extrabold">{o.order_number}</span>
                <span className="text-sm text-gray-500">{o.status}</span>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                收件人：{full?.customer?.name} · 總額 NT${Math.round(o.total_amount).toLocaleString()}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                報關身分證：<span className="font-mono">{maskIdNumber(full?.customs?.id_number || "")}</span>
              </div>
              <StatusForm orderId={o.id} current={o.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
