import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { buildPurchaseList, listAwaitingShipment } from "@/lib/graph/procurement";
import { notifyPurchaseList } from "@/lib/line";

export const dynamic = "force-dynamic";

// Agent 6：自動採購清單（彙總已付款／採購中訂單）+ 待出貨包裹。
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const list = await buildPurchaseList();
  const awaiting = await listAwaitingShipment();
  return NextResponse.json({ ...list, awaiting });
}

// 採購清單 → LINE 通知管理員（後台按鈕或 cron 觸發；未設定 LINE token 時 sent=false）。
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const list = await buildPurchaseList();
  if (!list.items.length) return NextResponse.json({ ok: true, sent: false, reason: "目前無待採購商品" });
  const sent = await notifyPurchaseList(list);
  return NextResponse.json({ ok: true, sent, items: list.items.length, totalItems: list.totalItems });
}