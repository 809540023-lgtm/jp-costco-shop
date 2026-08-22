"use client";

import { useState } from "react";

export default function AddToCart({
  productId,
  name,
  price,
  imageUrl
}: {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
}) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  function add() {
    const key = "jp_costco_cart";
    const cart = JSON.parse(localStorage.getItem(key) || "[]") as any[];
    const existing = cart.find((i) => i.productId === productId);
    if (existing) existing.quantity += qty;
    else cart.push({ productId, name, unitPrice: price, quantity: qty, imageUrl });
    localStorage.setItem(key, JSON.stringify(cart));
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} className="btn btn-ghost h-12 w-12 px-0">−</button>
        <input
          type="number"
          value={qty}
          min={1}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          className="input text-center"
        />
        <button type="button" onClick={() => setQty(qty + 1)} className="btn btn-ghost h-12 w-12 px-0">＋</button>
      </div>
      <button type="button" onClick={add} className="btn btn-primary mt-3 w-full text-lg">
        {added ? "✅ 已加入購物車" : "加入購物車"}
      </button>
      <a href="/costco/cart" className="mt-2 block text-center text-sm text-gray-500 underline">前往購物車</a>
    </div>
  );
}
