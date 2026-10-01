"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CartItem } from "@/lib/models";
import { clearCart, readCart } from "@/lib/cart";
import type { CartIssue, ResolvedLine } from "@/lib/checkout-resolve";

interface ValidateResponse {
  lines: ResolvedLine[];
  issues: CartIssue[];
  warnings: CartIssue[];
  totals: { productTotal: number; shippingFee: number; customsFee: number; total: number };
}

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [view, setView] = useState<ValidateResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", postalCode: "", deliveryMethod: "",
    zhName: "", idNumber: "", customsPhone: "", customsEmail: "", ezwayPhone: "", consent: false, note: ""
  });
  const [error, setError] = useState("");

  const load = useCallback(async (cart: CartItem[]) => {
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/cart/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })) })
      });
      const data = (await res.json()) as ValidateResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "無法確認商品狀態");
      setView(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const cart = readCart();
    setItems(cart);
    void load(cart);
  }, [load]);

  const issues = view?.issues ?? [];
  const lines = view?.lines ?? [];
  const total = view?.totals.total ?? 0;
  const blocked = checking || issues.length > 0 || lines.length === 0;

  function set(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /** 收貨人與報關人可以直接沿用（同一人多數情況相同）。 */
  function copyFromCustomer() {
    setForm((f) => ({
      ...f,
      zhName: f.zhName || f.name,
      customsPhone: f.customsPhone || f.phone,
      customsEmail: f.customsEmail || f.email
    }));
  }

  async function submit() {
    if (blocked || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        // 只送商品 id 與數量；價格一律由伺服器決定
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        customer: {
          name: form.name, phone: form.phone, email: form.email, address: form.address,
          postalCode: form.postalCode, deliveryMethod: form.deliveryMethod, note: form.note
        },
        customs: {
          zhName: form.zhName || form.name, idNumber: form.idNumber, phone: form.customsPhone || form.phone,
          email: form.customsEmail || form.email, ezwayPhone: form.ezwayPhone, consent: form.consent
        }
      };
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "送出失敗");
        if (Array.isArray(data.issues)) void load(readCart()); // 內容有變動就重新校正
        return;
      }
      clearCart();
      router.push(`/costco/success?order=${encodeURIComponent(data.orderNumber)}`);
    } catch (e) {
      setError((e as Error).message || "網路錯誤，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  if (!checking && items.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
        購物車是空的。
        <br />
        <a href="/costco" className="mt-2 inline-block text-brand underline">去逛逛商品</a>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold">結帳</h1>

      {(view?.warnings?.length ?? 0) > 0 ? (
        <div className="mt-4 rounded-2xl border border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          <p className="font-extrabold">提醒（不影響下單）</p>
          <ul className="mt-2 space-y-1">
            {(view?.warnings ?? []).map((w) => (
              <li key={`${w.productId}-${w.reason}`}>• {w.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-extrabold">購物車內容需要更新</p>
          <ul className="mt-2 space-y-1">
            {issues.map((issue) => (
              <li key={`${issue.productId}-${issue.reason}`}>• {issue.message}</li>
            ))}
          </ul>
          <a href="/costco/cart" className="btn btn-ghost btn-sm mt-3">回購物車調整</a>
        </div>
      ) : null}

      <section className="mt-4 card">
        <h2 className="font-extrabold">訂購內容</h2>
        <div className="mt-3 space-y-2 text-sm">
          {lines.map((line) => (
            <div key={line.productId} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                {line.name}
                <span className="text-gray-500"> × {line.quantity}</span>
              </span>
              <span className="shrink-0 font-bold">NT${line.subtotal.toLocaleString()}</span>
            </div>
          ))}
          {checking ? <p className="text-gray-500">確認商品狀態中…</p> : null}
        </div>
        <div className="mt-3 space-y-1 border-t pt-3 text-sm text-gray-600">
          <div className="flex justify-between"><span>商品小計</span><span>NT${(view?.totals.productTotal ?? 0).toLocaleString()}</span></div>
          <div className="flex justify-between"><span>國際運費</span><span>待人工確認後通知</span></div>
        </div>
        <div className="mt-3 flex items-center justify-between text-lg font-extrabold">
          <span>目前應付</span>
          <span>NT${total.toLocaleString()}</span>
        </div>
      </section>

      <section className="mt-4 card">
        <h2 className="font-extrabold">收貨資料</h2>
        <div className="mt-3 space-y-3">
          <Field label="收件人姓名"><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" /></Field>
          <Field label="聯絡電話"><input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="09xxxxxxxx" inputMode="numeric" autoComplete="tel" /></Field>
          <Field label="Email"><input className="input" value={form.email} onChange={(e) => set("email", e.target.value)} inputMode="email" autoComplete="email" /></Field>
          <Field label="台灣收貨地址"><input className="input" value={form.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" /></Field>
          <Field label="郵遞區號"><input className="input" value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} placeholder="例如 106" inputMode="numeric" /></Field>
          <Field label="配送方式（選填）"><input className="input" value={form.deliveryMethod} onChange={(e) => set("deliveryMethod", e.target.value)} placeholder="例如 宅配 / 超商取貨" /></Field>
          <Field label="備註（選填）"><input className="input" value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
        </div>
      </section>

      <section className="mt-4 card">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">報關資料</h2>
          <button type="button" className="text-sm text-brand underline" onClick={copyFromCustomer}>
            同收貨人
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          身分證字號僅用於進口報關及物流作業，不作為其他行銷用途；系統僅在後台以遮罩顯示。
        </p>
        <div className="mt-3 space-y-3">
          <Field label="中文姓名"><input className="input" value={form.zhName} onChange={(e) => set("zhName", e.target.value)} /></Field>
          <Field label="身分證字號"><input className="input" value={form.idNumber} onChange={(e) => set("idNumber", e.target.value.toUpperCase())} placeholder="A123456789" autoComplete="off" /></Field>
          <Field label="手機號碼"><input className="input" value={form.customsPhone} onChange={(e) => set("customsPhone", e.target.value)} inputMode="numeric" /></Field>
          <Field label="EZ WAY 登記手機號碼"><input className="input" value={form.ezwayPhone} onChange={(e) => set("ezwayPhone", e.target.value)} placeholder="與收貨手機相同時可留空" inputMode="numeric" /></Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1" />
            我同意提供資料給報關及物流使用，並了解仍需依快遞或報關業者要求在 EZ WAY 完成實名認證。
          </label>
        </div>
      </section>

      {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 flex items-center justify-between text-lg font-extrabold">
        <span>目前應付</span>
        <span>NT${total.toLocaleString()}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">國際運費與關稅於採購後確認，會再通知你補款。</p>

      <button
        type="button"
        onClick={submit}
        disabled={blocked || submitting}
        className="btn btn-primary mt-3 w-full text-lg"
      >
        {submitting ? "送出中…" : checking ? "確認商品中…" : "送出訂單"}
      </button>

      <div className="mt-3 text-center text-sm">
        <a href="/costco/cart" className="text-gray-500 underline">回購物車</a>
      </div>
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
