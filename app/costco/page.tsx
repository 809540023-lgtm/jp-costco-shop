import { getPublishedProducts } from "@/lib/search";

export const dynamic = "force-dynamic";

export default function CostcoHome() {
  const products = getPublishedProducts();
  const latest = products[0]?.updated_at || null;

  return (
    <div>
      <h1 className="text-2xl font-extrabold">本期日本 Costco 精選</h1>
      <p className="mt-1 text-sm text-gray-500">
        {latest ? `本期更新：${latest.slice(0, 10)}` : "尚無已發布商品"}
      </p>

      {products.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          目前沒有已發布的商品，請稍後再來。
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {products.map((p) => (
            <a
              key={p.id}
              href={`/costco/product/${p.id}`}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
            >
              <div className="aspect-square w-full bg-gray-100">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt={p.jp_name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl">🛍️</div>
                )}
              </div>
              <div className="p-3">
                <div className="text-sm font-bold leading-snug">{p.zh_name || p.jp_name}</div>
                <div className="mt-1 text-sm font-extrabold text-brand">
                  NT${Math.round(p.taiwan_suggested_price || p.jp_price || 0)}
                </div>
                {p.is_hot_buy ? <span className="mt-1 inline-block rounded bg-brand px-1.5 py-0.5 text-xs text-white">Hot Buy</span> : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
