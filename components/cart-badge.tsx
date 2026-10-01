"use client";

import { useEffect, useState } from "react";
import { cartCount, readCart, subscribeCart } from "@/lib/cart";

/** 標頭購物車數量徽章：同分頁與其他分頁的變更都會即時更新。 */
export default function CartBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(cartCount(readCart()));
    return subscribeCart((items) => setCount(cartCount(items)));
  }, []);

  return (
    <a href="/costco/cart" className="font-bold" aria-label={`購物車，共 ${count} 件`}>
      購物車
      {count > 0 ? (
        <span className="ml-1 inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-white px-1.5 text-xs font-extrabold text-brand">
          {count}
        </span>
      ) : null}
    </a>
  );
}
