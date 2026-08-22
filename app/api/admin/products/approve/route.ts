import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "缺少商品 id" }, { status: 400 });
  db.prepare("UPDATE products SET status='approved', updated_at=datetime('now') WHERE id=?").run(id);
  audit("admin", "product_approved", "product", id);
  return NextResponse.json({ ok: true });
}
