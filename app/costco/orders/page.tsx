"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicOrderView } from "@/lib/orders";
import { ORDER_FLOW, flowStep, shippingGateLabel, statusDescription, statusLabel } from "@/lib/order-status";

export default function OrdersPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<PublicOrderView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = useCallback(async (number: string, tel: string) => {
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: number, phone: tel })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "查詢失敗");
        return;
      }
      setOrder(data.order as PublicOrderView);
    } catch (e) {
      setError((e as Error).message || "網路錯誤");
    } finally {
      setLoading(false);
    }
  }, []);

  // 從訂單完成頁帶編號過來時，自動填好編號（手機仍需本人輸入）
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("order");
    if (fromUrl) setOrderNumber(fromUrl.toUpperCase());
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-extrabold">訂單查詢</h1>
      <p className="mt-1 text-sm text-gray-500">輸入訂單編號與下單時的手機號碼，即可查看目前進度。</p>

      <form
        className="mt-4 card space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void search(orderNumber.trim(), phone.trim());
        }}
      >
        <label className="block">
          <span className="label">訂單編號</span>
          <input
            className="input"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            placeholder="例如 JP20261001ABC123"
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="label">下單手機號碼</span>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xxxxxxxx"
            inputMode="numeric"
            autoComplete="tel"
          />
        </label>
        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
          {loading ? "查詢中…" : "查詢訂單"}
        </button>
      </form>

      {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}

      {order ? (
        <>
          <section className="mt-4 card">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold">{order.orderNumber}</h2>
              <span className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">{statusLabel(order.status)}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{statusDescription(order.status)}</p>
            {order.createdAt ? (
              <p className="mt-1 text-xs text-gray-400">下單時間：{new Date(order.createdAt).toLocaleString("zh-TW")}</p>
            ) : null}
          </section>

          <section className="mt-4 card">
            <h2 className="font-extrabold">進度</h2>
            <ol className="mt-2 space-y-1 text-sm">
              {ORDER_FLOW.map((step, index) => {
                const done = flowStep(order.status) > index + 1;
                const current = flowStep(order.status) === index + 1;
                return (
                  <li key={step} className={current ? "font-extrabold text-brand" : done ? "text-gray-900" : "text-gray-400"}>
                    {done ? "✅" : current ? "▶️" : "・"} {statusLabel(step)}
                  </li>
                );
              })}
            </ol>
            {order.status === "cancelled" || order.status === "customs_problem" ? (
              <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{statusLabel(order.status)}：{statusDescription(order.status)}</p>
            ) : null}
          </section>

          <section className="mt-4 card">
            <h2 className="font-extrabold">訂購內容</h2>
            <div className="mt-3 space-y-2 text-sm">
              {order.items.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    {item.name}
                    <span className="text-gray-500"> × {item.quantity}</span>
                  </span>
                  <span className="shrink-0 font-bold">NT${item.subtotal.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 border-t pt-3 text-sm text-gray-600">
              <div className="flex justify-between"><span>商品小計</span><span>NT${order.productTotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>國際運費</span><span>{shippingGateLabel(order.shippingFeeStatus)}</span></div>
              {order.shippingFee > 0 ? (
                <div className="flex justify-between"><span>運費金額</span><span>NT${order.shippingFee.toLocaleString()}</span></div>
              ) : null}
            </div>
            <div className="mt-2 flex items-center justify-between text-lg font-extrabold">
              <span>應付總額</span>
              <span>NT${order.totalAmount.toLocaleString()}</span>
            </div>
          </section>

          <section className="mt-4 card text-sm text-gray-600">
            <h2 className="font-extrabold text-gray-900">收貨資訊（已遮罩）</h2>
            <div className="mt-2 space-y-1">
              <div>收件人：{order.customer.name}</div>
              <div>電話：{order.customer.phone}</div>
              <div>地址：{order.customer.address}</div>
            </div>
          </section>
        </>
      ) : null}

      <div className="mt-4 text-center text-sm">
        <a href="/costco" className="text-gray-500 underline">回商品總覽</a>
      </div>
    </div>
  );
}
