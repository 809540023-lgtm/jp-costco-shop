import { getPublicOrderView, type PublicOrderView } from "@/lib/orders";
import { flowStep, shippingGateLabel, statusDescription, statusLabel, ORDER_FLOW } from "@/lib/order-status";

export const dynamic = "force-dynamic";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;

  // 公開頁面不可因資料層失敗而 500（AGENTS.md）：查不到就顯示基本資訊。
  let view: PublicOrderView | null = null;
  try {
    view = order ? await getPublicOrderView(order) : null;
  } catch {
    view = null;
  }

  return (
    <div>
      <div className="text-center">
        <div className="text-5xl">🎉</div>
        <h1 className="mt-3 text-2xl font-extrabold">訂單已送出</h1>
        <p className="mt-2 text-gray-600">
          訂單編號：<span className="font-bold">{view?.orderNumber || order || "—"}</span>
        </p>
        {view ? <p className="mt-1 text-sm text-gray-500">{statusLabel(view.status)}　{statusDescription(view.status)}</p> : null}
      </div>

      {view ? (
        <>
          <section className="mt-5 card">
            <h2 className="font-extrabold">訂購內容</h2>
            <div className="mt-3 space-y-2 text-sm">
              {view.items.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    {item.name}
                    <span className="text-gray-500"> × {item.quantity}</span>
                  </span>
                  <span className="shrink-0 font-bold">NT${item.subtotal.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 border-t pt-3 text-sm text-gray-600">
              <div className="flex justify-between"><span>商品小計</span><span>NT${view.productTotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>國際運費</span><span>{shippingGateLabel(view.shippingFeeStatus)}</span></div>
            </div>
            <div className="mt-2 flex items-center justify-between text-lg font-extrabold">
              <span>目前應付</span>
              <span>NT${view.totalAmount.toLocaleString()}</span>
            </div>
          </section>

          <section className="mt-4 card text-sm text-gray-600">
            <h2 className="font-extrabold text-gray-900">收貨資訊（已遮罩）</h2>
            <div className="mt-2 space-y-1">
              <div>收件人：{view.customer.name}</div>
              <div>電話：{view.customer.phone}</div>
              <div>地址：{view.customer.address}</div>
            </div>
          </section>

          <section className="mt-4 card">
            <h2 className="font-extrabold">進度</h2>
            <ol className="mt-2 space-y-1 text-sm">
              {ORDER_FLOW.map((step, index) => {
                const done = flowStep(view?.status) > index + 1;
                const current = flowStep(view?.status) === index + 1;
                return (
                  <li key={step} className={current ? "font-extrabold text-brand" : done ? "text-gray-900" : "text-gray-400"}>
                    {done ? "✅" : current ? "▶️" : "・"} {statusLabel(step)}
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      ) : (
        <p className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          已收到你的訂單。若需要查詢進度，請用「<a href="/costco/orders" className="text-brand underline">訂單查詢</a>」
          輸入訂單編號與下單手機。
        </p>
      )}

      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
        <p className="font-bold text-gray-900">📦 接下來會發生什麼</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>我們會與你確認付款方式</li>
          <li>日本採購完成後通知你，並確認國際運費與關稅金額</li>
          <li>你完成運費補款後，商品寄出、台灣報關</li>
          <li>請依快遞或報關業者要求在 <b>EZ WAY</b> 完成實名認證</li>
        </ol>
        <p className="mt-3 text-xs text-gray-400">商品可能因海關、食品、化妝品或其他法規原因無法進口。</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <a href="/costco/orders" className="btn btn-ghost">查詢訂單</a>
        <a href="/costco" className="btn btn-primary">繼續逛逛</a>
      </div>
    </div>
  );
}
