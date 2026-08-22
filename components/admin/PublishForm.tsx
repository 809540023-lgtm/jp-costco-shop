"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Item { id: string; zh_name?: string | null; jp_name: string; score: number | null; }

export default function PublishForm({ items }: { items: Item[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(items.map((i) => i.id));

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await fetch("/api/admin/products/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected })
    });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-2">
      {items.length === 0 ? <p className="text-gray-500">尚無已發布商品。</p> : null}
      {items.map((p) => (
        <label key={p.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3">
          <input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />
          <div className="flex-1">
            <div className="font-bold">{p.zh_name || p.jp_name}</div>
            <div className="text-xs text-gray-500">分數 {p.score}</div>
          </div>
        </label>
      ))}
      <button className="btn btn-primary w-full">發布本期商品</button>
    </form>
  );
}
