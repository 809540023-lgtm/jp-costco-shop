// 資料庫層：使用 Node 內建 node:sqlite (DatabaseSync)，同步、無需原生編譯。
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "jp-costco.db");
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

// 若資料庫為空，則建立 schema。
const table = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='products'").get() as { n: number };
if (table.n === 0) {
  const schema = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");
  db.exec(schema);
}

export function audit(actor: string, action: string, entityType: string, entityId: string, detail?: string) {
  db.prepare("INSERT INTO audit_logs (actor, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?)")
    .run(actor, action, entityType, entityId, detail || null);
}
