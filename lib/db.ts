// 資料庫層：使用 Node 內建 node:sqlite (DatabaseSync)，同步、無需原生編譯。
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "jp-costco.db");
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
// 並行（多 route 同時 import）時避免「database is locked」。
db.exec("PRAGMA busy_timeout = 5000;");
try {
  db.exec("PRAGMA journal_mode = WAL;");
} catch (e) {
  // 已有其他連線持有鎖時，改用 rollback journal 繼續運作。
  try { db.exec("PRAGMA journal_mode = DELETE;"); } catch (_) { /* ignore */ }
}

// 若資料庫為空，則建立 schema。
const table = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='products'").get() as { n: number };
if (table.n === 0) {
  const schema = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");
  db.exec(schema);
} else {
  // 既有資料庫補欄位（idempotent migration）
  migrateColumn(db, "products", "english_name", "TEXT");
  migrateColumn(db, "products", "description", "TEXT");
  migrateColumn(db, "products", "summary", "TEXT");
  migrateColumn(db, "products", "features", "TEXT");
  // 確保比較價格表存在
  db.exec(`CREATE TABLE IF NOT EXISTS comparison_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_name TEXT,
    price REAL,
    currency TEXT DEFAULT 'JPY',
    captured_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );`);
}

function migrateColumn(conn: DatabaseSync, table: string, column: string, type: string) {
  const r = conn.prepare(`SELECT count(*) AS n FROM pragma_table_info(?) WHERE name = ?`).get(table, column) as { n: number };
  if (r.n === 0) {
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
export function audit(actor: string, action: string, entityType: string, entityId: string, detail?: string) {
  db.prepare("INSERT INTO audit_logs (actor, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?)")
    .run(actor, action, entityType, entityId, detail || null);
}
