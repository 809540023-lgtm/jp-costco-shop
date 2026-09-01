import { getPublishedWeeklyDeals } from "@/lib/onsite-deals";

export const dynamic = "force-dynamic";

function yen(value: number | null) {
  return value == null ? null : `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

export default async function OnsiteDealsPage() {
  const deals = await getPublishedWeeklyDeals();

  return (
    <div>
      <h1 className="text-2xl font-extrabold">🔥 本週 Costco 現場商品</h1>
      <p className="mt-1 text-sm text-gray-500">由日本 Costco 現場照片辨識，經人工確認後才會發布。</p>

      {deals.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          現場照片正在整理與確認，已確認商品會顯示在這裡。
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {deals.map((deal) => (
            <article key={deal.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="grid grid-cols-2 bg-gray-100">
                {[deal.primary_photo_url, deal.price_tag_photo_url].map((src, i) => (
                  <div key={i} className="aspect-square">
                    {src ? <img src={src} alt={i === 0 ? deal.product_name_ja : "現場價牌"} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl">{i === 0 ? "🛍️" : "🏷️"}</div>}
                  </div>
                ))}
              </div>
              <div className="p-4">
                <h2 className="font-extrabold">{deal.product_name_zh || deal.product_name_ja}</h2>
                {deal.product_name_zh ? <p className="mt-0.5 text-xs text-gray-500">{deal.product_name_ja}</p> : null}
                <div className="mt-2 flex items-baseline gap-2">
                  {deal.sale_price_jpy != null ? <span className="text-xl font-extrabold text-red-600">{yen(deal.sale_price_jpy)}</span> : null}
                  {deal.regular_price_jpy != null && deal.sale_price_jpy != null ? <span className="text-sm text-gray-400 line-through">{yen(deal.regular_price_jpy)}</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  {deal.discount_jpy != null ? <span className="rounded bg-red-50 px-2 py-1 text-red-700">省 {yen(deal.discount_jpy)}</span> : <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">🏷️ 現場價格</span>}
                  {deal.unit_price_label ? <span className="rounded bg-gray-100 px-2 py-1">{deal.unit_price_label}</span> : null}
                  {deal.sale_end_date ? <span className="rounded bg-gray-100 px-2 py-1">至 {deal.sale_end_date}</span> : null}
                  {deal.costco_item_number ? <span className="rounded bg-gray-100 px-2 py-1">Item {deal.costco_item_number}</span> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
