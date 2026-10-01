"use client";

import { useState } from "react";
import { MAX_ITEMS, MAX_QUANTITY, addToCart, readCart, writeCart } from "@/lib/cart";
import type { CartItem } from "@/lib/models";

export default function AddToCart({
  item
}: {
  item: CartItem;
}) {
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState("");
  const [added, setAdded] = useState(false);

  function add() {
    const result = addToCart(readCart(), item, qty);
    if (!result.ok) {
      setMessage(result.reason === "max_items" ? `購物車最多 ${MAX_ITEMS} 種商品` : "數量不正確");
      return;
    }
    writeCart(result.items);
    setMessage("");
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="減少數量"
          onClick={() => setQty(Math.max(1, qty - 1))}
          className="btn btn-ghost h-12 w-12 px-0"
        >
          −
        </button>
        <input
          type="number"
          value={qty}
          min={1}
          max={MAX_QUANTITY}
          aria-label="數量"
          onChange={(e) => setQty(Math.min(MAX_QUANTITY, Math.max(1, Number(e.target.value) || 1)))}
          className="input text-center"
        />
        <button
          type="button"
          aria-label="增加數量"
          onClick={() => setQty(Math.min(MAX_QUANTITY, qty + 1))}
          className="btn btn-ghost h-12 w-12 px-0"
        >
          ＋
        </button>
      </div>
      <button type="button" onClick={add} className="btn btn-primary mt-3 w-full text-lg">
        {added ? "✅ 已加入購物車" : "加入購物車"}
      </button>
      {message ? <p className="mt-2 text-center text-sm text-red-500">{message}</p> : null}
      <a href="/costco/cart" className="mt-2 block text-center text-sm text-gray-500 underline">前往購物車</a>
    </div>
  );
}
