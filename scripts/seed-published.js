// 啟動時還原已發布商品（供 Render 免費層 SQLite 在重啟清空後重新播種）。
// 若 products 表沒有已發布商品，則從 published-snapshot.json 還原商品與比較價格。
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
db.exec(`CREATE TABLE IF NOT EXISTS comparison_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL, source TEXT NOT NULL,
  source_name TEXT, price REAL, currency TEXT DEFAULT 'JPY',
  captured_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (product_id) REFERENCES products(id));`);

const published = db.prepare("SELECT count(*) n FROM products WHERE status='published'").get().n;
if (published > 0) {
  console.log("已發布商品存在，跳過還原。");
  db.close();
  process.exit(0);
}

const snapPath = path.join(__dirname, "published-snapshot.json");
if (!fs.existsSync(snapPath)) {
  console.log("找不到 published-snapshot.json，略過還原。");
  db.close();
  process.exit(0);
}

const snap = JSON.parse(fs.readFileSync(snapPath, "utf8"));
let count = 0;
for (const p of snap.products) {
  db.prepare(
    `INSERT OR REPLACE INTO products (id, jp_name, zh_name, english_name, brand, category, spec, description, summary, features,
      jan_code, costco_url, image_url, jp_price, discount_price, price_confirmed_at, in_stock, is_hot_buy, is_new,
      rating, review_count, evidence_source, evidence_type, japan_exclusive_note, taiwan_demand, taiwan_suggested_price,
      logistics_cost, landed_cost, regulation_risk, suitable_for_import, procurement_note, status, score, search_batch_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    p.id, p.jp_name, p.zh_name, p.english_name, p.brand, p.category, p.spec, p.description, p.summary, p.features,
    p.jan_code, p.costco_url, p.image_url, p.jp_price, p.discount_price, p.price_confirmed_at, p.in_stock, p.is_hot_buy, p.is_new,
    p.rating, p.review_count, p.evidence_source, p.evidence_type, p.japan_exclusive_note, p.taiwan_demand, p.taiwan_suggested_price,
    p.logistics_cost, p.landed_cost, p.regulation_risk, p.suitable_for_import, p.procurement_note, p.status, p.score, p.search_batch_id
  );
  for (const c of p.comparison_prices || []) {
    db.prepare("INSERT OR REPLACE INTO comparison_prices (product_id, source, source_name, price, currency, captured_at) VALUES (?,?,?,?,?,?)")
      .run(p.id, c.source, c.source_name, c.price, c.currency, c.captured_at);
  }
  count++;
}
console.log(`已還原 ${count} 筆已發布商品與比較價格。`);
db.close();
