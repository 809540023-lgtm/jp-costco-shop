// Supabase 客戶端（伺服器端，使用 service_role key）。
import { createClient } from "@supabase/supabase-js";

// Next build 會載入 route modules；未設定正式環境變數時仍須能完成編譯。
// 動態頁面實際查詢前，部署環境仍必須提供真正的 Supabase 設定。
const url = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "build-placeholder-key";

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
