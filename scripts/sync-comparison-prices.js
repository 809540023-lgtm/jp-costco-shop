// 其他通路價格比較（Yahoo 購物／Amazon JP）→ Supabase comparison_prices。
// 取代舊 SQLite 版（scrape-top50.js 的比較價格段落）：商品本體由 /api/cron/run-search 的官方 API 擷取負責，
// 這支只補「其他通路價格」這一塊，寫入與前台讀取一致的同一個資料層。
//
// 用法：
//   node scripts/sync-comparison-prices.js [--limit=20] [--id=<productId>] [--force]
//     --limit=N  只處理前 N 項已發布商品（預設 20）
//     --id=xxx   只處理指定商品
//     --force    連已有比較價格的商品也重抓（預設跳過）
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { fetchComparisonPrices } = require(path.join(__dirname, "..", "lib", "price-compare.js"));

const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const URL = process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!URL || !KEY) {
  console.error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（請設定於 .env）。");
  process.exit(2);
}

const args = process.argv.slice(2);
const idArg = args.find((a) => a.startsWith("--id="));
const limitArg = args.find((a) => a.startsWith("--limit="));
const force = args.includes("--force");
const limit = limitArg ? Math.max(1, parseInt(limitArg.slice("--limit=".length), 10) || 20) : 20;

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

async function pickProducts() {
  let q = supabase.from("products").select("id, jp_name").order("score", { ascending: false }).limit(limit);
  if (idArg) q = supabase.from("products").select("id, jp_name").eq("id", idArg.slice("--id=".length));
  else q = q.eq("status", "published");
  const { data, error } = await q;
  if (error) throw new Error(`讀取 products 失敗: ${error.message}`);
  return data || [];
}

async function existingProductIds() {
  const { data, error } = await supabase.from("comparison_prices").select("product_id");
  if (error) throw new Error(`讀取 comparison_prices 失敗: ${error.message}`);
  return new Set((data || []).map((r) => r.product_id));
}

async function syncOne(product) {
  const comps = await fetchComparisonPrices(product.jp_name);
  // 同一商品重抓時先清掉舊列，避免累積過期報價（前台只顯示最新一筆／每個來源一筆）。
  const { error: delError } = await supabase.from("comparison_prices").delete().eq("product_id", product.id);
  if (delError) throw new Error(`清除舊比較價格失敗: ${delError.message}`);
  if (!comps.length) return 0;
  const rows = comps.map((c) => ({
    product_id: product.id,
    source: c.source,
    source_name: c.name || null,
    price: c.price,
    currency: c.currency || "JPY"
  }));
  const { error } = await supabase.from("comparison_prices").insert(rows);
  if (error) throw new Error(`寫入比較價格失敗: ${error.message}`);
  return rows.length;
}

async function main() {
  const products = await pickProducts();
  if (!products.length) {
    console.log("沒有符合條件的商品（預設只處理 status='published'）。");
    return;
  }

  const have = force ? new Set() : await existingProductIds();
  const targets = products.filter((p) => !have.has(p.id));
  if (!targets.length) {
    console.log(`已發布商品 ${products.length} 項都已有比較價格，略過（要重抓請加 --force）。`);
    return;
  }

  console.log(`開始同步其他通路價格：目標 ${targets.length} 項（共 ${products.length} 項）。`);
  let done = 0;
  let empty = 0;
  let failed = 0;
  for (const p of targets) {
    try {
      const n = await syncOne(p);
      if (n) {
        done += 1;
        console.log(`  [比較] ${(p.jp_name || "").slice(0, 24)} → ${n} 筆`);
      } else {
        empty += 1;
      }
    } catch (e) {
      failed += 1;
      console.log(`  [略過] ${(p.jp_name || "").slice(0, 24)}：${e.message}`);
    }
  }
  console.log(`完成：有報價 ${done} 項、來源無回應 ${empty} 項、失敗 ${failed} 項。`);
  console.log("（best-effort：來源被擋或無法解析時略過，不影響主流程。）");
}

main().catch((e) => {
  console.error("同步失敗:", e.message);
  process.exit(1);
});
