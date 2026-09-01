import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { syncCostcoDriveFolder } from "@/lib/google-drive-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const result = await syncCostcoDriveFolder();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drive 同步失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
