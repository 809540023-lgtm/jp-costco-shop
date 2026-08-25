import { NextResponse } from "next/server";
import { checkoutSchema } from "@/lib/validation";
import { createOrder } from "@/lib/orders";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.errors[0]?.message || "輸入資料有誤";
      return NextResponse.json({ error: first }, { status: 400 });
    }
    const order = await createOrder(parsed.data);
    return NextResponse.json({ orderId: order.orderId, orderNumber: order.orderNumber }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "伺服器錯誤" }, { status: 500 });
  }
}
