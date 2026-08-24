"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CartItem } from "@/lib/models";

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", postalCode: "", deliveryMethod: "",
    zhName: "", idNumber: "", customsPhone: "", customsEmail: "", ezwayPhone: "", consent: false, note: ""
  });
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(JSON.parse(localStorage.getItem("jp_costco_cart") || "[]"));
  }, []);

  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  function set(k: string, v: string | boolean) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setError("");
    const payload = {
      items,
      customer: {
        name: form.name, phone: form.phone, email: form.email, address: form.address,
        postalCode: form.postalCode, deliveryMethod: form.deliveryMethod, note: form.note
      },
      customs: {
        zhName: form.zhName, idNumber: form.idNumber, phone: form.customsPhone,
        email: form.customsEmail, ezwayPhone: form.ezwayPhone, consent: form.consent
      }
    };
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "送出失敗"); return; }
    localStorage.removeItem("jp_costco_cart");
    router.push(`/costco/success?order=${data.orderNumber}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold">結帳</h1>
      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed p-10 text-center text-gray-500">購物車是空的。</div>
      ) : (
        <>
          <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="font-extrabold">收貨資料</h2>
            <div className="mt-3 space-y-3">
              <Field label="收件人姓名"><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="聯絡電話"><input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="09xxxxxxxx" /></Field>
              <Field label="Email"><input className="input" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
              <Field label="台灣收貨地址"><input className="input" value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
              <Field label="郵遞區號"><input className="input" value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} /></Field>
              <Field label="配送方式"><input className="input" value={form.deliveryMethod} onChange={(e) => set("deliveryMethod", e.target.value)} /></Field>
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="font-extrabold">報關資料</h2>
            <p className="mt-1 text-xs text-gray-500">身分證字號僅用於進口報關及物流作業，不作為其他行銷用途。</p>
            <div className="mt-3 space-y-3">
              <Field label="中文姓名"><input className="input" value={form.zhName} onChange={(e) => set("zhName", e.target.value)} /></Field>
              <Field label="身分證字號"><input className="input" value={form.idNumber} onChange={(e) => set("idNumber", e.target.value.toUpperCase())} placeholder="A123456789" /></Field>
              <Field label="手機號碼"><input className="input" value={form.customsPhone} onChange={(e) => set("customsPhone", e.target.value)} /></Field>
              <Field label="EZ WAY 登記手機號碼"><input className="input" value={form.ezwayPhone} onChange={(e) => set("ezwayPhone", e.target.value)} /></Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1" />
                我同意提供資料給報關及物流使用，並了解仍需依快遞或報關業者要求在 EZ WAY 完成實名認證。
              </label>
            </div>
          </section>

          {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}

          <div className="mt-4 flex items-center justify-between text-lg font-extrabold">
            <span>應付總額</span><span>¥{total.toLocaleString()}</span>
          </div>
          <button onClick={submit} className="btn btn-primary mt-3 w-full text-lg">送出訂單</button>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
