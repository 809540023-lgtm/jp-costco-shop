import { NextResponse } from "next/server";
import { checkoutSchema } from "@/lib/validation";
import { createOrder } from "@/lib/orders";
import { resolveCart } from "@/lib/checkout-resolve";

/**
 * 建立訂單。
 *
 * 安全原則：**只接受商品 id 與數量**，名稱與單價一律由伺服器從資料庫重取
 * （lib/checkout-resolve.ts）。先前版本直接採用前端傳來的 unitPrice，
 * 使用者只要改 localStorage 就能用任意價格下單。
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.errors[0]?.message || "輸入資料有誤";
      return NextResponse.json({ error: first }, { status: 400 });
    }

    const cart = await resolveCart(parsed.data.items);

    // 有任何一項不合格就整筆拒絕（不可部分成立，避免價格／庫存與實際不符）
    if (cart.issues.length || !cart.lines.length) {
      return NextResponse.json(
        {
          error: cart.issues[0]?.message || "購物車內容有誤，請回購物車確認",
          issues: cart.issues
        },
        { status: 409 }
      );
    }

    const order = await createOrder({
      lines: cart.lines,
      customer: parsed.data.customer,
      customs: parsed.data.customs
    });
    return NextResponse.json(
      { orderId: order.orderId, orderNumber: order.orderNumber, total: cart.total },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "伺服器錯誤" }, { status: 500 });
  }
}
