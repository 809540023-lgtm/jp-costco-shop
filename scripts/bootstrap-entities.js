// 2.0 商品 → 3.0 product_entity：Graph 冷啟動（重建後補回實體）。
//
// 為什麼需要這支：`product_entity` 目前只有「競業直播帶貨清冊」匯入時才會建立
// （scripts/import-livestream-signal.js、POST /api/admin/import-signal）。
// 重建或全新環境時 Graph 是空的 → Agent 1–5 沒有東西可評分，
// price_observation／review_snapshot／score_snapshot／content_draft 永遠長不出來。
//
// 預設只處理已發布商品（人工已上架的商業事實），可用 --status 擴大。
//
// 用法：
//   node scripts/bootstrap-entities.js                          # 預覽（不寫入）
//   node scripts/bootstrap-entities.js --post                   # 寫入（status=published）
//   node scripts/bootstrap-entities.js --post --status=published,pending_review
//   node scripts/bootstrap-entities.js --post --limit=50
//
// 注意：實體建立後，`npm run agents:run` 會開始評分它們（分數寫入 score_snapshot）。
// 人工已上架的實體標為 `listed`，不會因單次低分被自動標成 rejected（法規硬性淘汰除外）。
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

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

const args = process.argv.slice(2);
const post = args.includes("--post");
const statusArg = args.find((a) => a.startsWith("--status="));
const limitArg = args.find((a) => a.startsWith("--limit="));
const statuses = (statusArg ? statusArg.slice("--status=".length) : "published")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const limit = limitArg ? Math.max(1, parseInt(limitArg.slice("--limit=".length), 10) || 0) : 0;

const URL = process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!URL || !KEY) {
  console.error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（請設定於 .env）。");
  process.exit(2);
}
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

// 與 lib/graph/youtube-radar.ts 的 matchEntityByTitle 相同的正規化（比對在該處進行）。
function norm(s) {
  return (s || "").toLowerCase().replace(/\s+/g, "");
}

// 實體標準名：繁中譯名 > 英文名 > 日文名（與前台顯示的優先序一致）。
function canonicalName(p) {
  return (p.zh_name || p.english_name || p.jp_name || "").trim();
}

// 關鍵字供 Agent 1 影片標題比對（以「包含」比對，正規化後長度需 ≥ 4，太短容易誤命中）。
function keywordsFor(p) {
  const text = [p.jp_name, p.zh_name, p.english_name].filter(Boolean).join(" ");
  const tokens = text
    .split(/[\s\u3000\-_/、,，.．・（）()【】[\]｜|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const out = [];
  for (const t of [...tokens, p.brand, p.jan_code].filter(Boolean)) {
    const n = norm(String(t));
    if (n.length < 4 || out.includes(n)) continue;
    out.push(n);
    if (out.length >= 12) break;
  }
  return out;
}

async function fetchProducts() {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select("id, jp_name, zh_name, english_name, brand, category, jan_code, status, score")
      .in("status", statuses)
      .order("score", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`讀取 products 失敗：${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    if (limit && rows.length >= limit) break;
  }
  return limit ? rows.slice(0, limit) : rows;
}

async function fetchEntities() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("product_entity")
      .select("id, canonical_name, brand")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`讀取 product_entity 失敗：${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

// 以 canonical_name + brand 去重（與 product_entity 的 unique 條件及
// import-livestream-signal.js 的比對方式一致）。
function entityKey(name, brand) {
  return `${(name || "").trim()}|${(brand || "").trim()}`;
}

async function main() {
  console.log(`目標來源：products（status ∈ ${statuses.join(", ")}）${limit ? `，上限 ${limit} 筆` : ""}`);
  const [products, entities] = await Promise.all([fetchProducts(), fetchEntities()]);
  console.log(`商品 ${products.length} 筆、現有實體 ${entities.length} 筆。`);

  const existing = new Set(entities.map((e) => entityKey(e.canonical_name, e.brand)));
  const rows = [];
  let skippedNoName = 0;
  let skippedDuplicate = 0;

  for (const p of products) {
    const name = canonicalName(p);
    if (!name) {
      skippedNoName += 1;
      continue;
    }
    const key = entityKey(name, p.brand);
    if (existing.has(key)) {
      skippedDuplicate += 1;
      continue;
    }
    existing.add(key); // 同一次執行內也去重
    rows.push({
      canonical_name: name.slice(0, 200),
      canonical_name_jp: p.jp_name || null,
      brand: p.brand || null,
      category: p.category || null,
      keywords: keywordsFor(p),
      // 人工已上架 → listed（賣場事實）；其餘為候選
      status: p.status === "published" ? "listed" : "candidate"
    });
  }

  const listed = rows.filter((r) => r.status === "listed").length;
  console.log(
    `可建立 ${rows.length} 筆實體（listed ${listed}／candidate ${rows.length - listed}）；` +
      `已存在 ${skippedDuplicate} 筆、無名可建 ${skippedNoName} 筆。`
  );

  for (const r of rows.slice(0, 10)) {
    console.log(`  + [${r.status}] ${r.canonical_name}${r.canonical_name_jp ? ` ／ ${r.canonical_name_jp}` : ""}`);
  }
  if (rows.length > 10) console.log(`  …其餘 ${rows.length - 10} 筆`);

  if (!post) {
    console.log("\n目前是預覽模式（未寫入）。確認無誤後加上 --post 執行。");
    return;
  }
  if (!rows.length) {
    console.log("\n沒有需要建立的實體，未寫入。");
    return;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase.from("product_entity").insert(chunk);
    if (error) throw new Error(`寫入 product_entity 失敗：${error.message}`);
    inserted += chunk.length;
  }
  console.log(`\n完成：新增 ${inserted} 筆實體。`);
  console.log("下一步：npm run agents:run（會開始評分；分數與決策寫入 score_snapshot 可追溯）。");
}

main().catch((e) => {
  console.error("bootstrap 失敗:", e.message);
  process.exit(1);
});
