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

// 新功能採獨立、冪等 migration，既有資料庫也會補齊。
db.exec(`CREATE TABLE IF NOT EXISTS costco_photo_processing_queue (
  id TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  drive_folder_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  captured_at TEXT,
  drive_modified_at TEXT,
  download_status TEXT DEFAULT 'PENDING',
  conversion_status TEXT DEFAULT 'PENDING',
  vision_status TEXT DEFAULT 'PENDING',
  pairing_status TEXT DEFAULT 'PENDING',
  product_id TEXT,
  deal_id TEXT,
  confidence REAL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  processed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_photo_queue_status ON costco_photo_processing_queue(vision_status, pairing_status);
CREATE TABLE IF NOT EXISTS weekly_store_deals (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  costco_item_number TEXT,
  store_name TEXT,
  store_location TEXT,
  product_name_ja TEXT NOT NULL,
  product_name_zh TEXT,
  primary_photo_url TEXT,
  price_tag_photo_url TEXT,
  regular_price_jpy REAL,
  sale_price_jpy REAL,
  discount_jpy REAL,
  package_quantity REAL,
  package_unit TEXT,
  net_weight TEXT,
  unit_price REAL,
  unit_price_label TEXT,
  sale_start_date TEXT,
  sale_end_date TEXT,
  captured_at TEXT,
  captured_by TEXT,
  ai_description TEXT,
  ai_confidence REAL,
  verification_status TEXT DEFAULT 'UNVERIFIED',
  status TEXT DEFAULT 'draft',
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS costco_price_observations (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  deal_id TEXT,
  photo_id TEXT NOT NULL,
  store_name TEXT,
  store_location TEXT,
  observed_price REAL,
  regular_price REAL,
  discount_amount REAL,
  sale_start_date TEXT,
  sale_end_date TEXT,
  observed_at TEXT,
  confidence REAL,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);`);

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
