import { requireAdmin } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { buildPurchaseList } from "@/lib/graph/procurement";
import LogoutButton from "@/components/admin/LogoutButton";

export const dynamic = "force-dynamic";

interface FunnelRow {
  new_products_today: number;
  passed_first_round: number;
  suggested_this_week: number;
  hot_candidates: number;
  rejected_today: number;
  new_costco_promos: number;
}

export default async function AdminHome() {
  await requireAdmin();

  // 3.0 採購主管 Dashboard（SPEC 第十一節）：資料來源 v_dashboard_funnel / v_funnel_counts
  const { data: funnel } = await supabase.from("v_dashboard_funnel").select("*").maybeSingle<FunnelRow>();
  let purchaseCount = 0;
  try {
    purchaseCount = (await buildPurchaseList()).totalItems;
  } catch {
    purchaseCount = 0;
  }
  const f: FunnelRow = funnel ?? {
    new_products_today: 0, passed_first_round: 0, suggested_this_week: 0,
    hot_candidates: 0, rejected_today: 0, new_costco_promos: 0
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold">後台管理</h1>

      <h2 className="mt-6 text-lg font-bold">🤖 AI 採購主管 — 今日漏斗</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4"><div className="text-2xl font-extrabold">{f.new_products_today}</div><div className="text-sm text-gray-500">今日新發現商品</div></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4"><div className="text-2xl font-extrabold">{f.passed_first_round}</div><div className="text-sm text-gray-500">AI 通過第一輪</div></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4"><div className="text-2xl font-extrabold">{f.suggested_this_week}</div><div className="text-sm text-gray-500">本週主坛建議</div></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4"><div className="text-2xl font-extrabold">{f.hot_candidates}</div><div className="text-sm text-gray-500">爆品候選</div></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4"><div className="text-2xl font-extrabold">{f.new_costco_promos}</div><div className="text-sm text-gray-500">日本 Costco 新特價</div></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4"><div className="text-2xl font-extrabold">{f.rejected_today}</div><div className="text-sm text-gray-500">不建議商品</div></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4"><div className="text-2xl font-extrabold">{purchaseCount}</div><div className="text-sm text-gray-500">待採購件數（訂單）</div></div>
      </div>

      <div className="mt-4 grid gap-3">
        <a href="/admin/onsite" className="rounded-2xl border border-gray-200 bg-white p-5 font-bold">📷 Costco 現場商品</a>
        <a href="/admin/products" className="rounded-2xl border border-gray-200 bg-white p-5 font-bold">📦 商品審核與發布</a>
        <a href="/admin/drafts" className="rounded-2xl border border-gray-200 bg-white p-5 font-bold">🤖 自動文案草稿</a>
        <a href="/admin/orders" className="rounded-2xl border border-gray-200 bg-white p-5 font-bold">📋 訂單管理</a>
        <a href="/admin/procurement" className="rounded-2xl border border-gray-200 bg-white p-5 font-bold">🛒 採購清單（Agent 6）</a>
        <a href="/admin/batches" className="rounded-2xl border border-gray-200 bg-white p-5 font-bold">🔍 搜尋批次</a>
      </div>
      <div className="mt-6">
        <LogoutButton />
      </div>
    </div>
  );
}
