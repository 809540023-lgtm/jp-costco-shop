"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: fd.get("password") })
    });
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setError(true);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <input type="password" name="password" placeholder="管理員密碼" className="input" autoComplete="current-password" required />
      {error ? <p className="text-sm text-red-600">密碼錯誤，請重試。</p> : null}
      <button className="btn btn-primary w-full">登入</button>
    </form>
  );
}
