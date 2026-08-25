import { NextResponse } from "next/server";
import { supabase, audit } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "缺少商品 id" }, { status: 400 });
  await supabase.from("products").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", id);
  await audit("admin", "product_approved", "product", id);
  return NextResponse.json({ ok: true });
}
