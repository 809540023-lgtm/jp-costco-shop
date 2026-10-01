import { NextResponse } from "next/server";
import { cartValidateSchema } from "@/lib/validation";
import { resolveCart } from "@/lib/checkout-resolve";

/**
 * 購物車即時校正。
 *
 * 購物車存在瀏覽器，價格與供應狀態都可能過期（商品被下架、改價、標成未定價）。
 * 購物車頁與結帳頁都用這支把「目前資料庫的實際狀況」取回來覆蓋顯示，
 * 讓使用者不會看到過期價格，也讓結帳前的金額與伺服器一致。
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = cartValidateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "購物車資料格式錯誤" }, { status: 400 });
    }
    const cart = await resolveCart(parsed.data.items);
    return NextResponse.json({
      lines: cart.lines,
      issues: cart.issues,
      warnings: cart.warnings,
      totals: {
        productTotal: cart.productTotal,
        shippingFee: cart.shippingFee,
        customsFee: cart.customsFee,
        total: cart.total
      }
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "伺服器錯誤" }, { status: 500 });
  }
}
