import { requireAdmin } from "@/lib/auth";
import { buildPurchaseList, listAwaitingShipment } from "@/lib/graph/procurement";
import ProcurementNotifyButton from "@/components/admin/ProcurementNotifyButton";

export const dynamic = "force-dynamic";

// Agent 6（SPEC 第十節）：採購清單自動彙總待採購商品與數量，降低在日採購作業。
export default async function AdminProcurement() {
  await requireAdmin();
  const list = await buildPurchaseList();
  const awaiting = await listAwaitingShipment();

  return (
    <div>
      <a href="/admin" className="text-sm text-gray-500">← 後台</a>
      <h1 className="mt-2 text-2xl font-extrabold">採購清單</h1>
      <p className="mt-1 text-sm text-gray-500">彙總已付款／採購中訂單的商品與數量。唯一人工卡點：實際國際運費（於訂單管理確認）。</p>
      <ProcurementNotifyButton />

      <div className="mt-4 text-sm font-bold">合計 {list.totalItems} 件 · {list.items.length} 項商品</div>
      <div className="mt-3 space-y-2">
        {list.items.length === 0 ? <p className="text-gray-500">目前無待採購商品。</p> : null}
        {list.items.map((i) => (
          <div key={i.productRef} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
            <div className="font-bold">{i.productName}</div>
            <div className="text-sm text-gray-600">
              數量 ×{i.quantity}　單價 NT${Math.round(i.unitPrice).toLocaleString()}　訂單 {i.orderIds.length} 筆
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-bold">📦 待出貨包裹（運費已確認）</h2>
      <div className="mt-3 space-y-2">
        {awaiting.length === 0 ? <p className="text-gray-500">目前無待出貨訂單。</p> : null}
        {awaiting.map((o) => (
          <div key={o.id} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
            <div className="font-bold">{o.order_number}</div>
            <div className="text-sm text-gray-600">
              {o.status} · 總額 NT${Math.round(Number(o.total_amount)).toLocaleString()}
              {o.tracking_number ? ` · 追蹤 ${o.tracking_number}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}