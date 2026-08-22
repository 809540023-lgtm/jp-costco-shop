import { Suspense } from "react";

export default function SuccessPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  return (
    <Suspense fallback={<div>載入中…</div>}>
      <SuccessInner searchParams={searchParams} />
    </Suspense>
  );
}

async function SuccessInner({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  return (
    <div className="text-center">
      <div className="text-6xl">🎉</div>
      <h1 className="mt-3 text-2xl font-extrabold">訂單已送出</h1>
      <p className="mt-2 text-gray-600">訂單編號：<span className="font-bold">{order || "—"}</span></p>
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left text-sm text-gray-600">
        <p>📦 後續流程：</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>我們會與你確認付款方式</li>
          <li>日本採購完成後通知你</li>
          <li>商品寄出、台灣報關</li>
          <li>請依快遞或報關業者要求在 <b>EZ WAY</b> 完成實名認證</li>
        </ol>
        <p className="mt-3 text-xs text-gray-400">商品可能因海關、食品、化妝品或其他法規原因無法進口。</p>
      </div>
      <a href="/costco" className="btn btn-primary mt-6 w-full">繼續逛逛</a>
    </div>
  );
}
