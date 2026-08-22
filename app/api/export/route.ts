import { listOrders, getOrder, maskIdNumber } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET() {
  const orders = listOrders();
  const rows = orders.map((o) => {
    const full = getOrder(o.id);
    return [o.order_number, o.status, full?.customer?.name || "", maskIdNumber(full?.customs?.id_number || ""), o.total_amount];
  });
  const csv = ["訂單編號,狀態,收件人,身分證(遮罩),總額"].concat(rows.map((r) => r.join(","))).join("\n");
  return new Response("\ufeff" + csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": "attachment; filename=orders.csv"
    }
  });
}
