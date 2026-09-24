import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { buildOnsiteAcceptanceReport } from "@/lib/onsite-report";

export const dynamic = "force-dynamic";

// 驗收數字報告（JSON 匯出用，交接文件規定的實際數字清單）。
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  try {
    return NextResponse.json(await buildOnsiteAcceptanceReport());
  } catch (error) {
    const message = error instanceof Error ? error.message : "驗收報告產生失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}