import LivePlayer from "@/components/live/LivePlayer";
import { getPublishedProducts } from "@/lib/search";

export const dynamic = "force-dynamic";

// 直播串流網址：正式使用請設定環境變數 LIVE_STREAM_URL（.m3u8 或 .mp4）。
// 未設定時使用示範串流。
const DEMO_STREAM = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

export default function LivePage() {
  const src = process.env.LIVE_STREAM_URL || DEMO_STREAM;
  const weeklyProducts = getPublishedProducts().slice(0, 12);
  return (
    <div>
      <a href="/costco" className="text-sm text-gray-500">← 返回商品總覽</a>
      <h1 className="mt-2 text-2xl font-extrabold">美洲區好市多 · 每週商品直播</h1>
      <p className="mt-1 text-sm text-gray-500">
        看到喜歡的商品，按右邊大按鈕「📸 截圖儲存」，就會存到你的手機。
      </p>

      <div className="mt-4">
        <LivePlayer src={src} />
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-bold">使用說明</p>
        <ul className="mt-1 list-inside list-disc space-y-1">
          <li>點「📸 截圖儲存」會把目前直播畫面存成圖片。</li>
          <li>手機上會跳出分享選單，選「儲存到照片」即可。</li>
          <li>若沒有跳出選單，會直接下載圖片到手機。</li>
        </ul>
      </div>

      <h2 className="mt-8 text-xl font-extrabold">本週美洲區商品</h2>
      <p className="mt-1 text-sm text-gray-500">本週精選的熱門商品，點進去可以看完整說明與價格。</p>
      {weeklyProducts.length === 0 ? (
        <p className="mt-3 text-gray-500">尚無商品。</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {weeklyProducts.map((p) => (
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
                <div className="text-sm font-bold leading-snug line-clamp-2">{p.zh_name || p.jp_name}</div>
                <div className="mt-1 text-sm font-extrabold text-brand">
                  ¥{Math.round(p.jp_price || 0).toLocaleString()}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

