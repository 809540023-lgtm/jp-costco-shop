// 後台登入與權限控管。
// 使用 HTTP-only cookie + HMAC 簽章，避免把密碼寫入前端。
// 密碼來自環境變數 ADMIN_PASSWORD（未設定時用開發預設值，正式環境務必設定）。
import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";

const COOKIE = "admin_session";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

function sign(value: string): string {
  return createHmac("sha256", ADMIN_PASSWORD).update(value).digest("hex");
}

// 登入成功後建立 session cookie。
export async function setAdminSession(): Promise<void> {
  const token = randomBytes(24).toString("hex");
  const value = `${token}.${sign(token)}`;
  const store = await cookies();
  store.set(COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
}

// 清除 session cookie。
export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

// 驗證目前是否已登入。
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  if (!value) return false;
  const [token, sig] = value.split(".");
  if (!token || !sig) return false;
  const expected = sign(token);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// 驗證密碼（常數時間比較，避免計時攻擊）。
export async function checkPassword(input: string): Promise<boolean> {
  const a = Buffer.from(input);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// 頁面用：未登入則導向登入頁。
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
