import { NextResponse } from "next/server";
import { checkPassword, setAdminSession, isAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    if (await isAdmin()) return NextResponse.json({ ok: true });
    const body = await request.json().catch(() => ({}));
    const password = String(body.password || "");
    if (await checkPassword(password)) {
      await setAdminSession();
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "登入失敗" }, { status: 500 });
  }
}
