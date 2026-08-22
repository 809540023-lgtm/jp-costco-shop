// 加入測試資料：建立一筆搜尋批次與數筆待審核商品。
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

const batchId = `sb-${new Date().toISOString().slice(0, 10)}`;
db.prepare("INSERT OR IGNORE INTO search_batches (id, search_date, status, product_count) VALUES (?,?,?,?)")
  .run(batchId, new Date().toISOString().slice(0, 10), 3);

const samples = [
  { id: "p-001", jpName: "日本製 抹茶チョコレート", zhName: "日本抹茶巧克力", category: "零食", jpPrice: 1280, isHotBuy: 1, isNew: 1, rating: 4.5, reviewCount: 320, score: 88 },
  { id: "p-002", jpName: "北海道 白い恋人", zhName: "北海道白色戀人", category: "零食", jpPrice: 1580, isHotBuy: 1, rating: 4.7, reviewCount: 500, score: 92 },
  { id: "p-003", jpName: "日本製 醤油ラーメン 5食", zhName: "日本醬油拉麵 5 入", category: "食品", jpPrice: 980, isNew: 1, rating: 4.2, reviewCount: 150, score: 76 }
];

for (const s of samples) {
  db.prepare(
    `INSERT OR IGNORE INTO products (id, jp_name, zh_name, category, jp_price, is_hot_buy, is_new, rating, review_count, status, score, search_batch_id)
     VALUES (?,?,?,?,?,?,?,?,?,'pending_review',?,?)`
  ).run(s.id, s.jpName, s.zhName, s.category, s.jpPrice, s.isHotBuy || 0, s.isNew || 0, s.rating ?? null, s.reviewCount || 0, s.score, batchId);
  db.prepare("INSERT OR IGNORE INTO product_rankings (product_id, search_batch_id, score) VALUES (?,?,?)").run(s.id, batchId, s.score);
}

console.log("已加入測試資料:", samples.length, "筆待審核商品，批次:", batchId);
db.close();
