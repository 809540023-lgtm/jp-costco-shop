import { listOrders, getOrder, maskIdNumber } from "@/lib/orders";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  const orders = await listOrders();
  const fulls = await Promise.all(orders.map((o) => getOrder(o.id)));
  const rows = orders.map((o, idx) => {
    const full = fulls[idx];
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
