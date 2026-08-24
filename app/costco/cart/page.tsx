"use client";

import { useEffect, useState } from "react";
import { CartItem } from "@/lib/models";

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(JSON.parse(localStorage.getItem("jp_costco_cart") || "[]"));
  }, []);

  function persist(next: CartItem[]) {
    localStorage.setItem("jp_costco_cart", JSON.stringify(next));
    setItems(next);
  }
  function remove(productId: string) {
    persist(items.filter((i) => i.productId !== productId));
  }
  function setQty(productId: string, qty: number) {
    persist(items.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(1, qty) } : i)));
  }

  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <div>
      <h1 className="text-2xl font-extrabold">購物車</h1>
      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          購物車是空的。
          <br /><a href="/costco" className="mt-2 inline-block text-brand underline">去逛逛商品</a>
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            {items.map((i) => (
              <div key={i.productId} className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-3">
                <div className="h-20 w-20 rounded-xl bg-gray-100">
                  {i.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.imageUrl} alt="" className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl">🛍️</div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-bold">{i.name}</div>
                  <div className="text-sm text-gray-500">NT${i.unitPrice.toLocaleString()}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <button onClick={() => setQty(i.productId, i.quantity - 1)} className="h-8 w-8 rounded-lg border">−</button>
                    <span>{i.quantity}</span>
                    <button onClick={() => setQty(i.productId, i.quantity + 1)} className="h-8 w-8 rounded-lg border">＋</button>
                    <button onClick={() => remove(i.productId)} className="ml-auto text-sm text-red-500">移除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-lg font-extrabold">
            <span>小計</span>
            <span>NT${total.toLocaleString()}</span>
          </div>
          <a href="/costco/checkout" className="btn btn-primary mt-3 w-full text-lg">前往結帳</a>
        </>
      )}
    </div>
  );
}
