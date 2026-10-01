"use client";

import { useCallback, useEffect, useState } from "react";
import type { CartItem } from "@/lib/models";
import {
  CART_KEY,
  MAX_ITEMS,
  MAX_QUANTITY,
  cartCount,
  clearCart,
  readCart,
  removeFromCart,
  setQuantity,
  writeCart
} from "@/lib/cart";
import type { CartIssue, ResolvedLine } from "@/lib/checkout-resolve";

interface ValidateResponse {
  lines: ResolvedLine[];
  issues: CartIssue[];
  warnings: CartIssue[];
  totals: { productTotal: number; shippingFee: number; customsFee: number; total: number };
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [view, setView] = useState<ValidateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /** 以伺服器資料校正購物車顯示（價格、可否購買都以此為準）。 */
  const refresh = useCallback(async (cart: CartItem[]) => {
    if (!cart.length) {
      setView({ lines: [], issues: [], warnings: [], totals: { productTotal: 0, shippingFee: 0, customsFee: 0, total: 0 } });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cart/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })) })
      });
      const data = (await res.json()) as ValidateResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "無法取得最新價格");
      setView(data);

      // 把伺服器的最新名稱與價格寫回本機（讓其他頁面顯示一致）
      const priceById = new Map(data.lines.map((l) => [l.productId, l]));
      const synced = cart.map((i) => {
        const line = priceById.get(i.productId);
        return line ? { ...i, name: line.name, unitPrice: line.unitPrice, imageUrl: line.imageUrl ?? i.imageUrl } : i;
      });
      writeCart(synced);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cart = readCart();
    setItems(cart);
    void refresh(cart);
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== CART_KEY) return;
      const next = readCart();
      setItems(next);
      void refresh(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  function apply(next: CartItem[]) {
    const saved = writeCart(next);
    setItems(saved);
    void refresh(saved);
  }

  const issues = view?.issues ?? [];
  const warnings = view?.warnings ?? [];
  const brokenIds = new Set(issues.map((i) => i.productId));
  const warnedIds = new Set(warnings.map((w) => w.productId));
  const sellable = items.filter((i) => !brokenIds.has(i.productId));
  const total = view?.totals.total ?? 0;
  const availableCount = (view?.lines ?? []).reduce((s, l) => s + l.quantity, 0);
  const blockedReason =
    issues.length > 0
      ? "有商品目前已無法購買，請先移除後再結帳"
      : sellable.length === 0
        ? "購物車是空的"
        : "";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold">購物車</h1>
        {items.length > 0 ? <span className="text-sm text-gray-500">共 {cartCount(items)} 件</span> : null}
      </div>

      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          購物車是空的。
          <br />
          <a href="/costco" className="mt-2 inline-block text-brand underline">去逛逛商品</a>
        </div>
      ) : (
        <>
          {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}

          {issues.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-extrabold">以下商品目前無法購買</p>
              <ul className="mt-2 space-y-1">
                {issues.map((issue) => (
                  <li key={`${issue.productId}-${issue.reason}`}>
                    • {items.find((i) => i.productId === issue.productId)?.name || issue.productId}：{issue.message}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-3"
                onClick={() => apply(items.filter((i) => !brokenIds.has(i.productId)))}
              >
                移除這些商品
              </button>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
              <p className="font-extrabold">提醒</p>
              <ul className="mt-2 space-y-1">
                {warnings.map((w) => (
                  <li key={`${w.productId}-${w.reason}`}>
                    • {items.find((i) => i.productId === w.productId)?.name || w.productId}：{w.message}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500">這些商品仍可下單；我們會在採購時確認，若真的無法取得會通知你退款或換貨。</p>
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {items.map((item) => {
              const line = view?.lines.find((l) => l.productId === item.productId);
              const broken = brokenIds.has(item.productId);
              const warned = warnedIds.has(item.productId);
              const price = line?.unitPrice ?? item.unitPrice;
              return (
                <div
                  key={item.productId}
                  className={`flex gap-3 rounded-2xl border bg-white p-3 ${broken ? "border-amber-300 opacity-70" : "border-gray-200"}`}
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl">🛍️</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <a href={`/costco/product/${item.productId}`} className="font-bold hover:underline">
                      {line?.name || item.name}
                    </a>
                    {warned ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">標示缺貨</span> : null}
                    <div className="text-sm text-gray-500">NT${price.toLocaleString()}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="減少數量"
                        className="h-8 w-8 rounded-lg border"
                        onClick={() => apply(setQuantity(items, item.productId, item.quantity - 1))}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={MAX_QUANTITY}
                        value={item.quantity}
                        aria-label="數量"
                        onChange={(e) => apply(setQuantity(items, item.productId, Number(e.target.value)))}
                        className="h-8 w-14 rounded-lg border border-gray-300 text-center"
                      />
                      <button
                        type="button"
                        aria-label="增加數量"
                        className="h-8 w-8 rounded-lg border"
                        onClick={() => apply(setQuantity(items, item.productId, item.quantity + 1))}
                      >
                        ＋
                      </button>
                      <span className="ml-1 text-sm font-bold">
                        NT${(price * item.quantity).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => apply(removeFromCart(items, item.productId))}
                        className="ml-auto text-sm text-red-500"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 card">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>商品小計（{availableCount} 件）</span>
              <span>NT${(view?.totals.productTotal ?? 0).toLocaleString()}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
              <span>國際運費</span>
              <span>待人工確認後通知</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-lg font-extrabold">
              <span>目前應付</span>
              <span>{loading ? "計算中…" : `NT$${total.toLocaleString()}`}</span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              跨境代購的國際運費與關稅依實際重量與報關結果計算，我們會在採購後與你確認金額，再請你補款。
            </p>
          </div>

          {blockedReason ? (
            <p className="mt-3 rounded-xl bg-gray-100 p-3 text-center text-sm text-gray-600">{blockedReason}</p>
          ) : null}

          <a
            href={blockedReason ? "#" : "/costco/checkout"}
            aria-disabled={!!blockedReason}
            className={`btn btn-primary mt-3 w-full text-lg ${blockedReason ? "pointer-events-none opacity-50" : ""}`}
          >
            前往結帳
          </a>

          <div className="mt-3 flex items-center justify-between text-sm">
            <a href="/costco" className="text-gray-500 underline">繼續購物</a>
            <button
              type="button"
              className="text-gray-400 underline"
              onClick={() => {
                if (confirm("確定清空購物車？")) apply(clearCart());
              }}
            >
              清空購物車
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">最多可放 {MAX_ITEMS} 種商品，每種最多 {MAX_QUANTITY} 件。</p>
        </>
      )}
    </div>
  );
}
