-- JP Costco 購物系統資料庫結構
-- 依規格書：商品與訂單之間使用 product_id 關聯。

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 商品
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  jp_name TEXT NOT NULL,
  zh_name TEXT,
  brand TEXT,
  category TEXT,
  spec TEXT,
  jan_code TEXT,
  costco_url TEXT,
  image_url TEXT,
  jp_price REAL,
  discount_price REAL,
  price_confirmed_at TEXT,
  in_stock INTEGER DEFAULT 0,
  is_hot_buy INTEGER DEFAULT 0,
  is_new INTEGER DEFAULT 0,
  rating REAL,
  review_count INTEGER DEFAULT 0,
  evidence_source TEXT,
  evidence_type TEXT,
  japan_exclusive_note TEXT,
  taiwan_demand TEXT,
  taiwan_suggested_price REAL,
  logistics_cost REAL,
  landed_cost REAL,
  regulation_risk TEXT,
  suitable_for_import INTEGER DEFAULT 1,
  procurement_note TEXT,
  status TEXT DEFAULT 'draft', -- draft/pending_review/approved/published/sold_out/archived
  score REAL DEFAULT 0,
  search_batch_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 商品來源
CREATE TABLE IF NOT EXISTS product_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  source_type TEXT NOT NULL, -- official_hot_buy / official_new / official_review / third_party
  source_url TEXT,
  source_title TEXT,
  evidence TEXT,
  captured_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 搜尋批次
CREATE TABLE IF NOT EXISTS search_batches (
  id TEXT PRIMARY KEY,
  search_date TEXT NOT NULL,
  status TEXT DEFAULT 'running', -- running/completed/failed
  summary TEXT,
  product_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 商品排名
CREATE TABLE IF NOT EXISTS product_rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  search_batch_id TEXT NOT NULL,
  rank INTEGER,
  score REAL,
  score_breakdown TEXT, -- JSON 各分項來源
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (search_batch_id) REFERENCES search_batches(id)
);

-- 已發布商品集合
CREATE TABLE IF NOT EXISTS published_collections (
  id TEXT PRIMARY KEY, -- 例如 2026-08-22-costco-japan-top50
  title TEXT,
  status TEXT DEFAULT 'published',
  published_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS published_collection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  rank INTEGER,
  FOREIGN KEY (collection_id) REFERENCES published_collections(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 訂單
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending', -- pending/awaiting_payment/paid/purchasing/shipped_from_japan/customs_clearance/taiwan_received/shipping_to_customer/completed/cancelled/customs_problem
  product_total REAL DEFAULT 0,
  shipping_fee REAL DEFAULT 0,
  customs_fee REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 訂單明細（保存下單當時的商品名稱與價格）
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  image_url TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 客戶資料
CREATE TABLE IF NOT EXISTS customer_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT NOT NULL,
  postal_code TEXT,
  delivery_method TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 報關資料（敏感資料，需遮罩與權限控管）
CREATE TABLE IF NOT EXISTS customs_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  zh_name TEXT NOT NULL,
  id_number TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  ezway_phone TEXT,
  consent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 通知
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- new_order / status_change / payment_reminder / japan_purchased / taiwan_arrived / search_failed
  channel TEXT DEFAULT 'line',
  recipient TEXT,
  title TEXT,
  body TEXT,
  status TEXT DEFAULT 'pending',
  sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 稽核紀錄
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
