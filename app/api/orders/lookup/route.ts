import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupOrder } from "@/lib/orders";

const lookupSchema = z.object({
  orderNumber: z.string().min(4).max(40),
  phone: z.string().min(9).max(20)
});

/**
 * 訂單查詢（客戶端）。
 *
 * 必須「訂單編號 + 下單手機」同時正確才回傳，避免猜到編號就看到別人的訂單。
 * 回傳內容已遮罩（姓名／手機／地址），不含身分證字號。
 */
export async function POST(request: Request) {
  try {
    const parsed = lookupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "請輸入訂單編號與下單時的手機號碼" }, { status: 400 });
    }
    const order = await lookupOrder(parsed.data.orderNumber, parsed.data.phone);
    if (!order) {
      return NextResponse.json({ error: "查不到符合的訂單，請確認訂單編號與手機號碼" }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "伺服器錯誤" }, { status: 500 });
  }
}
