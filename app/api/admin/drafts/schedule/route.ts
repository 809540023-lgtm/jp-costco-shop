import { NextResponse } from "next/server";
import { supabase, audit } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";
import { validateScheduledFor } from "@/lib/publish";

export const dynamic = "force-dynamic";

// Agent 5 排程發布：核准草稿並設定發布時間（到期由 /api/cron/publish-scheduled 發布）
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const draftId = String(body.draftId || "");
  if (!draftId) return NextResponse.json({ error: "缺少 draftId" }, { status: 400 });

  const { data: draft } = await supabase.from("content_draft")
    .select("publish_status").eq("id", draftId).maybeSingle();
  if (!draft) return NextResponse.json({ error: "草稿不存在" }, { status: 404 });
  if (draft.publish_status === "published") return NextResponse.json({ error: "草稿已發布" }, { status: 409 });

  if (body.cancel) {
    await supabase.from("content_draft").update({ scheduled_for: null }).eq("id", draftId);
    await audit("admin", "draft_schedule_cancelled", "content_draft", draftId);
    return NextResponse.json({ ok: true, cancelled: true });
  }

  const iso = validateScheduledFor(body.scheduledFor, new Date());
  if (!iso) return NextResponse.json({ error: "排程時間需為未來時間" }, { status: 400 });
  await supabase.from("content_draft").update({
    publish_status: "approved",
    approved_at: new Date().toISOString(),
    scheduled_for: iso
  }).eq("id", draftId);
  await audit("admin", "draft_scheduled", "content_draft", draftId, `scheduled_for=${iso}`);
  return NextResponse.json({ ok: true, scheduledFor: iso });
}