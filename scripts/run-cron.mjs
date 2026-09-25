// 手動觸發 cron 端點。3.0 起資料層只有 Supabase 一條路徑：
// 本機與正式環境都打同一個 API route，不再有「手動跑寫 SQLite、cron 寫 Supabase」的雙軌問題。
//
// 用法：
//   node scripts/run-cron.mjs run-search|run-agents|publish-scheduled [--base=http://localhost:3000]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const JOBS = {
  "run-search": "/api/cron/run-search",
  "run-agents": "/api/cron/run-agents",
  "publish-scheduled": "/api/cron/publish-scheduled"
};

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
const job = args.find((a) => !a.startsWith("--"));
const baseArg = args.find((a) => a.startsWith("--base="));

if (!job || !JOBS[job]) {
  console.error(`用法：node scripts/run-cron.mjs <${Object.keys(JOBS).join("|")}> [--base=<網址>]`);
  process.exit(2);
}

const base = (baseArg ? baseArg.slice("--base=".length) : process.env.CRON_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET || "";
const url = `${base}${JOBS[job]}`;

if (!secret) {
  console.error("缺少 CRON_SECRET（請設定於 .env 或環境變數）。");
  process.exit(2);
}

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(base);

try {
  const res = await fetch(url, { headers: { "x-cron-secret": secret } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  console.log(`${job} → ${res.status} ${url}`);
  console.log(typeof body === "string" ? body : JSON.stringify(body, null, 2));
  if (!res.ok) {
    console.error(`\n${job} 失敗（HTTP ${res.status}）。`);
    process.exit(1);
  }
} catch (e) {
  console.error(`無法連線 ${url}：${e.message}`);
  if (isLocal) console.error("本機請先啟動伺服器：npm run dev");
  process.exit(1);
}
