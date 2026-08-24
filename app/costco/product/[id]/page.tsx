import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import AddToCart from "./add-to-cart";

export const dynamic = "force-dynamic";

function safeHtml(html: string): string {
  // 移除潛在危險標籤（避免 XSS）
  return html.replace(/<(script|iframe|object|embed|style)[\s\S]*?<\/\1>/gi, "");
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND status='published'").get(id) as any;
  if (!product) notFound();

  const price = product.jp_price || 0;
  const features: { name: string; value: string }[] = (() => {
    if (!product.features) return [];
    try { return JSON.parse(product.features); } catch { return []; }
  })();
  const comparePrices = db.prepare(
    "SELECT source, source_name, price, currency, captured_at FROM comparison_prices WHERE product_id = ? ORDER BY captured_at DESC"
  ).all(product.id) as any[];

  function fmtCurrency(currency: string, value: number): string {
    if (currency === "TWD") return `NT$${Math.round(value).toLocaleString()}`;
    return `¥${Math.round(value).toLocaleString()}`;
  }

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
          <p className="mt-1 text-sm text-gray-500">{product.jp_name}{product.english_name ? `（${product.english_name}）` : null}</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-2xl font-extrabold text-brand">¥{Math.round(price).toLocaleString()}</span>
            {product.taiwan_suggested_price ? <span className="text-sm text-gray-400">NT${Math.round(product.taiwan_suggested_price).toLocaleString()}</span> : null}
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            {product.brand ? <Row k="品牌" v={product.brand} /> : null}
            {product.spec ? <Row k="規格" v={product.spec} /> : null}
            {product.category ? <Row k="分類" v={product.category} /> : null}
            {product.rating ? <Row k="評分" v={`${product.rating}（${product.review_count} 則評論）`} /> : null}
            {product.evidence_source ? <Row k="熱門證據" v={product.evidence_source} /> : null}
          </dl>

          {product.regulation_risk ? (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">⚠️ {product.regulation_risk}</p>
          ) : null}

          {product.summary ? (
            <div className="mt-6">
              <h2 className="text-base font-extrabold">商品重點</h2>
              <div className="prose prose-sm mt-2" dangerouslySetInnerHTML={{ __html: safeHtml(product.summary) }} />
            </div>
          ) : null}

          {product.description ? (
            <div className="mt-6">
              <h2 className="text-base font-extrabold">商品說明</h2>
              <div className="prose prose-sm mt-2" dangerouslySetInnerHTML={{ __html: safeHtml(product.description) }} />
            </div>
          ) : null}

          {features.length ? (
            <div className="mt-6">
              <h2 className="text-base font-extrabold">規格與功能</h2>
              <dl className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">
                {features.map((f, i) => (
                  <div key={i} className="flex justify-between gap-3 px-3 py-2 text-sm">
                    <dt className="text-gray-500">{f.name}</dt>
                    <dd className="text-right font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {comparePrices.length ? (
            <div className="mt-6">
              <h2 className="text-base font-extrabold">其他通路價格比較</h2>
              <p className="mt-1 text-xs text-gray-500">日本 Costco 價格 ¥{Math.round(product.jp_price || 0).toLocaleString()}。以下為其他通路參考價，供您比較。</p>
              <div className="mt-2 space-y-2">
                {comparePrices.map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                    <span className="text-sm font-medium">{c.source}</span>
                    <span className="text-sm font-bold">{fmtCurrency(c.currency, c.price)}</span>
                  </div>
                ))}
              </div>
            </div>
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
