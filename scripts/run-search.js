// 每日搜尋工作：搜尋日本 Costco → 整理日本特色商品 → 計算分數 → 寫入待審核商品 → 產生摘要。
// 依規格：每天早上 08:00 執行；時區原則上 Asia/Taipei。
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DISCLAIMER =
  "日本 Costco 未公開全國實際銷量前 50 名，本排名為依官方熱門訊號、評論數、Hot Buy、新品及日本市場討論度推估。";

const root = path.join(__dirname, "..");
const dbPath = process.env.DB_PATH || path.join(root, "data", "jp-costco.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

const n = db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='products'").get().n;
if (n === 0) db.exec(fs.readFileSync(path.join(root, "lib", "schema.sql"), "utf8"));

const W = { officialHotBuy: 15, officialNew: 10, reviews: 10, japanExclusive: 15, taiwanDemand: 15, logisticsFit: 15, regulationRisk: 10, profitSpeed: 5, marketBuzz: 5 };
const clamp = (v) => Math.max(0, Math.min(1, v));

function assess(raw) {
  const text = `${raw.jpName} ${raw.category || ""}`.toLowerCase();
  const exclude = /kirkland/.test(text) || /衛生紙|紙巾|礦泉/.test(text) || /冰箱|電視|洗衣機|sofa|tv|refrigerator|fridge|washing machine|mattress|chair|furniture|stand|desk|table|grill/.test(text) || /肉|魚|生鮮|冷藏|meat|fish|fresh|frozen|dairy|egg|milk|beef|pork|chicken|seafood/.test(text) || /薬|医療|酒|化粧|medicine|drug|alcohol|beer|wine|cosmetic|supplement|sun|sunscreen|spf|vitamin/.test(text) || /iphone|ipad|switch|sony|panasonic|dyson|samsung|lg|apple|nintendo/.test(text);
  const parts = {
    officialHotBuy: raw.isHotBuy ? W.officialHotBuy : 0,
    officialNew: raw.isNew ? W.officialNew : 0,
    reviews: clamp((raw.reviewCount || 0) / 200) * W.reviews,
    japanExclusive: (text.includes("日本") ? 0.9 : 0.4) * W.japanExclusive,
    taiwanDemand: 0.5 * W.taiwanDemand,
    logisticsFit: 0.6 * W.logisticsFit,
    regulationRisk: 0.8 * W.regulationRisk,
    profitSpeed: 0.6 * W.profitSpeed,
    marketBuzz: clamp((raw.reviewCount || 0) / 300) * W.marketBuzz
  };
  const total = Math.round(Object.values(parts).reduce((s, v) => s + v, 0) * 100) / 100;
  return { exclude, total };
}

function run(rawProducts) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const batchId = `sb-${date}-${now.toISOString().slice(11, 19).replace(/:/g, "")}`;
  db.prepare("INSERT INTO search_batches (id, search_date, status, product_count) VALUES (?,?,?,?)")
    .run(batchId, date, rawProducts.length);
  let kept = 0;
  for (const raw of rawProducts) {
    const { exclude, total } = assess(raw);
    if (exclude || total < 20) continue;
    db.prepare(
      `INSERT INTO products (id, jp_name, category, jp_price, is_hot_buy, is_new, rating, review_count, status, score, search_batch_id)
       VALUES (?,?,?,?,?,?,?,?,'pending_review',?,?)
       ON CONFLICT(id) DO UPDATE SET
         jp_name=excluded.jp_name, category=excluded.category, jp_price=excluded.jp_price,
         is_hot_buy=excluded.is_hot_buy, is_new=excluded.is_new, rating=excluded.rating,
         review_count=excluded.review_count, score=excluded.score,
         search_batch_id=excluded.search_batch_id, updated_at=datetime('now')`
    ).run(raw.id, raw.jpName, raw.category || null, raw.jpPrice || null,
      raw.isHotBuy ? 1 : 0, raw.isNew ? 1 : 0, raw.rating || null, raw.reviewCount || 0, total, batchId);
    db.prepare("INSERT INTO product_rankings (product_id, search_batch_id, score) VALUES (?,?,?)").run(raw.id, batchId, total);
    kept++;
  }
  db.prepare("UPDATE search_batches SET status='completed', summary=? WHERE id=?").run(`保留 ${kept} 項。${DISCLAIMER}`, batchId);
  return { batchId, kept };
}

async function fetchCostcoJapan() {
  const url = process.env.COSTCO_JP_URL || "https://www.costco.co.jp/";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "jp-costco-shop/1.0" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const html = await res.text();
    console.log("已取得 Costco Japan 頁面，長度:", html.length, "（正式環境需搭配 DOM 解析）");
  } catch (e) {
    console.warn("無法取得 Costco Japan（可能被阻擋）:", e.message);
  }
  return [];
}

async function main() {
  const raw = await fetchCostcoJapan();
  const { batchId, kept } = run(raw);
  console.log("搜尋批次:", batchId, "保留商品:", kept);
  console.log(DISCLAIMER);
  db.close();
}

main().catch((e) => { console.error("搜尋失敗:", e.message); process.exit(1); });
