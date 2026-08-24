// 抓取指定類別商品（日本茶、日本酒、乳液/保養品等），約 50 項。
// 依官方 API 搜尋多個關鍵字，去重後抓取完整說明、高解析圖片，並換算台幣售價。
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = path.join(__dirname, "..");
const dbPath = process.env.DB_PATH || path.join(root, "data", "jp-costco.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

const n = db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='products'").get().n;
if (n === 0) db.exec(fs.readFileSync(path.join(root, "lib", "schema.sql"), "utf8"));
for (const [c, t] of [["english_name", "TEXT"], ["description", "TEXT"], ["summary", "TEXT"], ["features", "TEXT"]]) {
  const r = db.prepare("SELECT count(*) n FROM pragma_table_info(?) WHERE name=?").get("products", c);
  if (r.n === 0) db.exec(`ALTER TABLE products ADD COLUMN ${c} ${t}`);
}
db.exec(`CREATE TABLE IF NOT EXISTS comparison_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL, source TEXT NOT NULL,
  source_name TEXT, price REAL, currency TEXT DEFAULT 'JPY',
  captured_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (product_id) REFERENCES products(id));`);

const API = "https://www.costco.co.jp/rest/v2/japan/products/search";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const TARGET = 50;
const JPY_TO_TWD = 0.20034;

// 搜尋關鍵字（日本茶、日本酒、乳液/保養品）
const QUERIES = ["日本茶", "お茶", "日本酒", "乳液", "スキンケア", "化粧水", "ローション"];

function isKirkland(name) { return /カークランド/.test(name); }
// 排除體積大/冷藏冷凍（但保留日本酒，因使用者指定要日本酒）
function isExcluded(name) {
  const t = name.toLowerCase();
  if (/冷凍|冷蔵|チルド|アイスクリーム|ジェラート|冷食|生鮮|ヨーグルト|豆腐|納豆|肉$|肉類|牛肉|豚肉|鶏肉|ハム|ベーコン|ソーセージ|魚|エビ|カニ|シーフード|バター|チーズ|牛乳|プチパン|プルコギ|クロワッサン/.test(t)) return true;
  if (/トイレットペーパー|ペーパータオル|ティッシュ|ミネラルウォーター|天然水|炭酸水|ペットボトル|おむつ|オムツ/.test(t)) return true;
  // 排除茶具/非食用配件（使用者要的是茶、日本酒、乳液等商品本身）
  if (/ティーカップ|ティーポット|ティーサーバー|ティープレート|ティーライト|キャンドル|ソーサー|カップ|ポット|サーバー|ティーセット|食器|茶器/.test(t)) return true;
  return false;
}

async function search(q, page = 0, size = 100) {
  const url = `${API}?query=${encodeURIComponent(q)}&currentPage=${page}&pageSize=${size}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return [];
  const d = await res.json();
  return d.products || [];
}

async function fetchDetail(code) {
  const url = `https://www.costco.co.jp/rest/v2/japan/products/${code}?fields=FULL`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return {};
  const d = await res.json();
  const features = [];
  for (const c of d.classifications || []) {
    if (!c) continue;
    for (const f of c.features || []) {
      for (const v of f.featureValues || []) {
        let val = v.value;
        if (val == null) continue;
        if (typeof val === "object") val = JSON.stringify(val);
        features.push({ name: f.name, value: String(val) });
      }
    }
  }
  const abs = (u) => (u.startsWith("http") ? u : `https://www.costco.co.jp${u.startsWith("/") ? "" : "/"}${u}`);
  let imageUrl = null;
  for (const fmt of ["zoom", "product"]) {
    const hit = (d.images || []).find((i) => i.format === fmt && i.url);
    if (hit) { imageUrl = abs(hit.url); break; }
  }
  return {
    englishName: d.englishName || null,
    description: d.description || null,
    summary: d.summary || null,
    features: features.length ? JSON.stringify(features) : null,
    imageUrl
  };
}

async function collect() {
  const byId = new Map();
  for (const q of QUERIES) {
    const prods = await search(q);
    for (const p of prods) {
      const name = p.name || "";
      if (isKirkland(name) || isExcluded(name)) continue;
      if (byId.has(p.code)) continue;
      byId.set(p.code, {
        id: `jp-${p.code}`, code: p.code, jpName: name,
        price: p.price ? p.price.value : null,
        priceFormatted: p.price ? p.price.formattedValue : null,
        rating: p.averageRating || null, reviewCount: p.numberOfReviews || 0,
        url: p.url ? new URL(p.url, "https://www.costco.co.jp/").toString() : null,
        imageUrl: null
      });
      if (byId.size >= TARGET * 2) break; // 多抓一些，去重後取前 50
    }
    if (byId.size >= TARGET * 2) break;
  }
  const list = [...byId.values()].slice(0, TARGET);
  for (let i = 0; i < list.length; i++) {
    const detail = await fetchDetail(list[i].code);
    Object.assign(list[i], detail);
  }
  return list;
}

function writeToDb(kept) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const batchId = `sb-${date}-${now.toISOString().slice(11, 19).replace(/:/g, "")}`;
  db.prepare("INSERT INTO search_batches (id, search_date, status, product_count) VALUES (?,?,?,?)").run(batchId, date, kept.length);
  for (const p of kept) {
    const twd = p.price ? Math.round(p.price * JPY_TO_TWD) : null;
    db.prepare(
      `INSERT INTO products (id, jp_name, english_name, costco_url, image_url, jp_price, taiwan_suggested_price,
        rating, review_count, description, summary, features, evidence_source, evidence_type, status, score, search_batch_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_review',?,?)
       ON CONFLICT(id) DO UPDATE SET
         jp_name=excluded.jp_name, english_name=excluded.english_name, costco_url=excluded.costco_url,
         image_url=excluded.image_url, jp_price=excluded.jp_price, taiwan_suggested_price=excluded.taiwan_suggested_price,
         rating=excluded.rating, review_count=excluded.review_count, description=excluded.description,
         summary=excluded.summary, features=excluded.features, evidence_source=excluded.evidence_source,
         evidence_type=excluded.evidence_type, score=excluded.score, search_batch_id=excluded.search_batch_id,
         updated_at=datetime('now')`
    ).run(
      p.id, p.jpName, p.englishName || null, p.url, p.imageUrl, p.price, twd,
      p.rating, p.reviewCount, p.description || null, p.summary || null, p.features || null,
      "https://www.costco.co.jp/", "official_category", 50, batchId
    );
    db.prepare("INSERT INTO product_rankings (product_id, search_batch_id, score) VALUES (?,?,?)").run(p.id, batchId, 50);
  }
  db.prepare("UPDATE search_batches SET status='completed', summary=? WHERE id=?").run(
    `依類別（日本茶/日本酒/乳液保養）保留 ${kept.length} 項待審核商品。`, batchId
  );
  return batchId;
}

async function main() {
  const kept = await collect();
  const batchId = writeToDb(kept);
  console.log(`搜尋批次: ${batchId}`);
  console.log(`保留 ${kept.length} 項（日本茶/日本酒/乳液保養），狀態：待審核。`);
  kept.forEach((p, i) => console.log(`${String(i + 1).padStart(2)}. ${p.jpName} ${p.priceFormatted ? "(" + p.priceFormatted + ")" : ""}`));
  db.close();
}

main().catch((e) => { console.error("失敗:", e.message); process.exit(1); });
