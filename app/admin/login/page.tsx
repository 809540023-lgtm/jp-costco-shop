import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import LoginForm from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLogin() {
  if (await isAdmin()) redirect("/admin");

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-extrabold">後台登入</h1>
      <LoginForm />
      <p className="mt-3 text-sm text-gray-500">密碼由環境變數 ADMIN_PASSWORD 設定。</p>
    </div>
  );
}
