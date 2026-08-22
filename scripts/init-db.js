// 初始化資料庫：建立 data 目錄與 schema。
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, "jp-costco.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");
const schema = fs.readFileSync(path.join(root, "lib", "schema.sql"), "utf8");
db.exec(schema);
console.log("資料庫已初始化:", dbPath);
db.close();
