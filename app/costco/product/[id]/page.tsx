import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import AddToCart from "./add-to-cart";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND status='published'").get(id) as any;
  if (!product) notFound();

  const price = product.taiwan_suggested_price || product.jp_price || 0;

  return (
    <div>
      <a href="/costco" className="text-sm text-gray-500">← 返回商品總覽</a>
      <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="aspect-square w-full bg-gray-100">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt={product.jp_name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl">🛍️</div>
          )}
        </div>
        <div className="p-4">
          <h1 className="text-xl font-extrabold">{product.zh_name || product.jp_name}</h1>
          <p className="mt-1 text-sm text-gray-500">{product.jp_name}</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-2xl font-extrabold text-brand">NT${Math.round(price)}</span>
            {product.jp_price ? <span className="text-sm text-gray-400 line-through">¥{Math.round(product.jp_price)}</span> : null}
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            {product.brand ? <Row k="品牌" v={product.brand} /> : null}
            {product.spec ? <Row k="規格" v={product.spec} /> : null}
            {product.category ? <Row k="分類" v={product.category} /> : null}
            {product.rating ? <Row k="評分" v={`${product.rating}（${product.review_count} 則評論）`} /> : null}
            {product.japan_exclusive_note ? <Row k="日本限定" v={product.japan_exclusive_note} /> : null}
            {product.evidence_source ? <Row k="熱門證據" v={product.evidence_source} /> : null}
          </dl>

          {product.regulation_risk ? (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">⚠️ {product.regulation_risk}</p>
          ) : null}

          <AddToCart productId={product.id} name={product.zh_name || product.jp_name} price={price} imageUrl={product.image_url} />
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
