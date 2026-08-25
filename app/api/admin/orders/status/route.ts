import { NextResponse } from "next/server";
import { updateOrderStatus } from "@/lib/orders";
import { isAdmin } from "@/lib/auth";

const STATUSES = new Set([
  "pending", "awaiting_payment", "paid", "purchasing", "shipped_from_japan",
  "customs_clearance", "taiwan_received", "shipped_to_customer",
  "completed", "cancelled", "customs_problem"
]);

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = String(body.status || "");
  if (!id || !STATUSES.has(status)) return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  await updateOrderStatus(id, status as any);
  return NextResponse.json({ ok: true });
}
