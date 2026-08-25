// Supabase 客戶端（伺服器端，使用 service_role key）。
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabase = createClient(url, key, {
  auth: { persistSession: false }
});

// 稽核紀錄寫入 Supabase
export async function audit(actor: string, action: string, entityType: string, entityId: string, detail?: string) {
  try {
    await supabase.from("audit_logs").insert({ actor, action, entity_type: entityType, entity_id: entityId, detail: detail || null });
  } catch (e) {
    console.error("audit 寫入失敗:", (e as Error).message);
  }
}
