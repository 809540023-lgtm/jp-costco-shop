export const dynamic = "force-dynamic";

export default function AdminHome() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold">後台管理</h1>
      <div className="mt-4 grid gap-3">
        <a href="/admin/products" className="rounded-2xl border border-gray-200 bg-white p-5 font-bold">📦 商品審核與發布</a>
        <a href="/admin/orders" className="rounded-2xl border border-gray-200 bg-white p-5 font-bold">📋 訂單管理</a>
        <a href="/admin/batches" className="rounded-2xl border border-gray-200 bg-white p-5 font-bold">🔍 搜尋批次</a>
      </div>
    </div>
  );
}
