// 把 published-snapshot.json 的已發布商品與比較價格匯入 Supabase。
// 使用 service_role key 透過 PostgREST 寫入。
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const getEnv = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, "m")); return m ? m[1].trim() : ""; };
const URL = getEnv("SUPABASE_URL");
const KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!URL || !KEY) { console.error("缺少 SUPABASE_URL / SERVICE_ROLE"); process.exit(1); }

const snap = JSON.parse(fs.readFileSync(path.join(root, "scripts", "published-snapshot.json"), "utf8"));

async function post(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": `Bearer ${KEY}`, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows)
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`${table} 寫入失敗: ${res.status} ${t.slice(0,200)}`); }
}

// 清理舊資料（避免重複）
const clearTable = async (t) => {
  const res = await fetch(`${URL}/rest/v1/${t}?id=not.is.null`, { method: "DELETE", headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` } });
  // 忽略錯誤
};

async function main() {
  await clearTable("comparison_prices");
  await clearTable("products");

  const products = snap.products.map((p) => {
    const { comparison_prices, ...rest } = p;
    return rest;
  });
  await post("products", products);
  console.log("products 匯入:", products.length);

  const comps = [];
  for (const p of snap.products) {
    for (const c of p.comparison_prices || []) {
      comps.push({ product_id: p.id, source: c.source, source_name: c.source_name, price: c.price, currency: c.currency, captured_at: c.captured_at });
    }
  }
  await post("comparison_prices", comps);
  console.log("comparison_prices 匯入:", comps.length);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
