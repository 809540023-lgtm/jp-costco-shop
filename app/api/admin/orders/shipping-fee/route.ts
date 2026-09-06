import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/auth";
import { confirmShippingFee, markShippingFeePaid } from "@/lib/orders";

export const dynamic = "force-dynamic";

// Agent 6 運費人工閘門：pending →（輸入實際運費）confirmed →（客戶補款）paid。
const bodySchema = z.object({
  id: z.string().min(1),
  shippingFee: z.number().min(0).optional(),
  paid: z.boolean().optional()
});

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  const { id, shippingFee, paid } = parsed.data;

  try {
    if (paid) {
      await markShippingFeePaid(id);
      return NextResponse.json({ ok: true, status: "paid" });
    }
    if (typeof shippingFee !== "number") return NextResponse.json({ error: "請輸入運費金額" }, { status: 400 });
    const { totalAmount } = await confirmShippingFee(id, shippingFee);
    return NextResponse.json({ ok: true, status: "confirmed", totalAmount });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "更新失敗" }, { status: 500 });
  }
}