#!/usr/bin/env node
// Supabase 一鍵重建包：SQL 套用順序 + 種子匯入 + Render 環境變數清單 + 驗收檢查表。
//
// 用法：
//   node scripts/rebuild-supabase.mjs                       # 檢查現況、產出 rebuild.sql、印出步驟（不改任何東西）
//   node scripts/rebuild-supabase.mjs --apply               # 套用 schema（優先用 psql，否則 Management API）
//   node scripts/rebuild-supabase.mjs --seed                # 匯入種子資料（published-snapshot.json）
//   node scripts/rebuild-supabase.mjs --check               # 跑驗收檢查（DNS／REST／28 張表）
//   node scripts/rebuild-supabase.mjs --all                 # apply → seed → check
//   node scripts/rebuild-supabase.mjs --url=https://xxx.supabase.co   # 指定新專案（只影響本次執行，不寫檔）
//   node scripts/rebuild-supabase.mjs --update-render --url=<新URL>    # 把 render.yaml 內硬編碼的舊 URL 換掉
//   node scripts/rebuild-supabase.mjs --write-env --url=<新URL>         # 用 Management API 取金鑰並整組寫入 .env
//   node scripts/rebuild-supabase.mjs --env-path=<路徑>                # 指定要寫入的 env 檔（預設 .env；注意不可用 --env-file，那是 Node 自己的參數）
//
// 為什麼不能用 PostgREST 建表：Supabase 的 REST（PostgREST）只做資料 CRUD，不能執行 DDL。
// 因此這支腳本提供三條路徑，自動挑可行的：
//   1. psql + SUPABASE_DB_URL（直連 Postgres，最穩）
//   2. Supabase Management API + SUPABASE_ACCESS_TOKEN（需專案權限的個人權杖）
//   3. 以上皆無 → 產出 supabase/rebuild.sql，貼進 Dashboard SQL Editor 執行
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argValue = (k, d = "") => {
  const m = args.find((a) => a.startsWith(`${k}=`));
  return m ? m.slice(k.length + 1) : d;
};

// ── 環境 ───────────────────────────────────────────────────────────────
function loadEnv() {
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();
const overrideUrl = argValue("--url");
if (overrideUrl) process.env.SUPABASE_URL = overrideUrl;
const ENV_FILE = argValue("--env-path", path.join(ROOT, ".env"));

const URL_ = process.env.SUPABASE_URL || "";
let SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DB_URL = process.env.SUPABASE_DB_URL || "";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";

const mask = (v) => (!v ? "(未設定)" : `${v.slice(0, 6)}… (${v.length} 字)`);
const host = URL_ ? new URL(URL_).host : "";
const projectRef = host ? host.split(".")[0] : "";

// ── 0. 自動取得新專案金鑰並寫入 .env（--write-env）────────────────────
// 新 URL 配上舊金鑰是最常見的重建失誤；這裡一次取回並整組寫入，確保三者同專案。
if (has("--write-env")) {
  console.log("\n【0】取得新專案金鑰並寫入 " + ENV_FILE);
  if (!overrideUrl) {
    console.log("  ❌ 需同時指定 --url=<新專案URL>");
  } else if (!ACCESS_TOKEN) {
    console.log("  ❌ 缺 SUPABASE_ACCESS_TOKEN，無法透過 Management API 取金鑰");
    console.log("     → 或手動把 anon／service_role 填進 .env");
  } else if (!projectRef) {
    console.log("  ❌ 無法從 URL 判定專案 ref");
  } else {
    const k = await fetchKeys(projectRef);
    if (!k.ok) {
      console.log(`  ❌ 取金鑰失敗：${k.detail}`);
      console.log("     → token 可能沒有這個專案的權限，請手動填 .env 的三個值");
    } else {
      const wrote = writeEnvFile(ENV_FILE, {
        SUPABASE_URL: overrideUrl,
        SUPABASE_ANON_KEY: k.anon,
        SUPABASE_SERVICE_ROLE_KEY: k.service
      });
      SERVICE_KEY = k.service;
      console.log(`  ✅ 已寫入 ${wrote.join("／")}（anon ${k.anon.length} 字、service_role ${k.service.length} 字）`);
    }
  }
}

// ── SQL 套用順序 ───────────────────────────────────────────────────────
// 順序即依賴順序：先 2.0 既有表，再依檔名時間排序的 3.0 migrations。
function sqlFiles() {
  const migDir = path.join(ROOT, "supabase", "migrations");
  const migs = fs.existsSync(migDir)
    ? fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()
    : [];
  return [
    { step: 1, label: "2.0 既有表（products／orders／published 等）", file: path.join(ROOT, "supabase", "schema.sql") },
    ...migs.map((f, i) => ({ step: i + 2, label: `3.0 migration：${f.replace(/^\d+_/, "").replace(/\.sql$/, "")}`, file: path.join(migDir, f) }))
  ];
}

function buildBundle(files) {
  const parts = [
    "-- 由 scripts/rebuild-supabase.mjs 產生：Supabase 重建用 SQL（依依賴順序串接）",
    `-- 產生時間：${new Date().toISOString()}`,
    "-- 用法：在 Supabase Dashboard → SQL Editor 貼上執行；或 psql -v ON_ERROR_STOP=1 -f 這個檔案",
    "-- 全部語句皆為 if not exists，可重複執行。",
    ""
  ];
  for (const s of files) {
    parts.push(`-- ══ 步驟 ${s.step}：${path.basename(s.file)} ── ${s.label} ══`);
    parts.push(fs.readFileSync(s.file, "utf8").trim());
    parts.push("");
  }
  const out = path.join(ROOT, "supabase", "rebuild.sql");
  fs.writeFileSync(out, parts.join("\n"));
  return { out, bytes: fs.statSync(out).size };
}

// 靜態驗證：確認 SQL 集合完整且沒有會靜默跳過的缺口。
function lintSql(files) {
  const created = new Set();
  const alerts = [];
  const reTable = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi;
  const reAlter = /alter\s+table\s+(if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi;
  const reIndex = /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?[a-z0-9_]*\s+on\s+(?:public\.)?"?([a-z0-9_]+)"?/gi;
  let alters = 0, indexes = 0, missingIfNotExists = 0;
  for (const s of files) {
    const sql = fs.readFileSync(s.file, "utf8");
    for (const m of sql.matchAll(reTable)) {
      const name = m[1].toLowerCase();
      if (created.has(name)) alerts.push(`重複定義（已用 if not exists，安全）：${name}`);
      created.add(name);
      if (!/if\s+not\s+exists/i.test(m[0])) missingIfNotExists++;
    }
    for (const m of sql.matchAll(reAlter)) {
      alters++;
      if (!created.has(m[2].toLowerCase())) alerts.push(`alter table 指向不存在的表：${m[2]}（${path.basename(s.file)}）`);
    }
    for (const m of sql.matchAll(reIndex)) {
      indexes++;
      if (!created.has(m[1].toLowerCase())) alerts.push(`create index 指向不存在的表：${m[1]}（${path.basename(s.file)}）`);
    }
  }
  return { tables: created.size, alters, indexes, missingIfNotExists, alerts };
}

// ── 套用 ───────────────────────────────────────────────────────────────
function hasPsql() {
  try { execFileSync("psql", ["--version"], { stdio: "pipe" }); return true; } catch { return false; }
}

async function applyWithPsql(files) {
  for (const s of files) {
    process.stdout.write(`  步驟 ${s.step} ${path.basename(s.file)} … `);
    const r = spawnSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", s.file], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`psql 失敗：${(r.stderr || "").trim().slice(0, 400)}`);
    console.log("OK");
  }
}

async function applyWithApi(files) {
  if (!projectRef) throw new Error("無法從 SUPABASE_URL 取得專案 ref");
  for (const s of files) {
    process.stdout.write(`  步驟 ${s.step} ${path.basename(s.file)} … `);
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: fs.readFileSync(s.file, "utf8") })
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      // 唯讀交易代表 token 沒有 DDL 權限（能 SELECT、能讀金鑰，但建不了表）
      if (/read-only transaction/i.test(body)) {
        throw new Error(
          "Management API 的 SQL 為唯讀：這組 SUPABASE_ACCESS_TOKEN 沒有建立資料表的權限。\n" +
          "     可行做法（擇一）：\n" +
          "     A) 把 supabase/rebuild.sql 貼進 Dashboard → SQL Editor 執行（最單純，69 條語句一次跑完）\n" +
          "     B) 在 .env 設 SUPABASE_DB_URL=<Dashboard → Settings → Database → Connection string> 後重跑（需 psql）"
        );
      }
      throw new Error(`Management API 失敗：${res.status} ${body}`);
    }
    console.log("OK");
  }
}

function pickApplyPath() {
  if (has("--psql")) return "psql";
  if (has("--api")) return "api";
  if (DB_URL && hasPsql()) return "psql";
  if (ACCESS_TOKEN) return "api";
  return "manual";
}

// ── 種子與驗收 ─────────────────────────────────────────────────────────
function run(cmd, argv) {
  return spawnSync(cmd, argv, { cwd: ROOT, encoding: "utf8" });
}

async function checkDns() {
  if (!host) return { ok: false, detail: "SUPABASE_URL 未設定" };
  try {
    await dns.lookup(host);
    return { ok: true, detail: "解析成功" };
  } catch (e) {
    return { ok: false, detail: `${e.code || e.message}：${host} 不存在（專案可能已刪除或改名）` };
  }
}

async function checkTables() {
  // 直接用 PostgREST 逐表 HEAD 檢查，不依賴 check-supabase.js 的輸出格式。
  if (!SERVICE_KEY) return { ok: false, tables: [], detail: "缺 SUPABASE_SERVICE_ROLE_KEY" };
  const sql = fs.readFileSync(path.join(ROOT, "supabase", "schema.sql"), "utf8");
  const set = new Set();
  for (const f of sqlFiles()) {
    const s = fs.readFileSync(f.file, "utf8");
    for (const m of s.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi)) set.add(m[1]);
  }
  const names = [...set].sort();
  const missing = [];
  const present = [];
  for (const t of names) {
    const res = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=0`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    (res.ok ? present : missing).push(t);
  }
  return { ok: missing.length === 0, tables: names, present, missing, detail: `${present.length}/${names.length} 張表可用` };
}

async function checkBucket() {
  // bucket 由 migration 建立（public=false）；這裡驗證實際狀態，避免被改成公開。
  if (!SERVICE_KEY || !host) return { ok: false, detail: "缺 service key" };
  try {
    const res = await fetch(`${URL_}/storage/v1/bucket/costco-onsite-media`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    if (!res.ok) return { ok: false, detail: `查詢失敗 HTTP ${res.status}` };
    const b = await res.json();
    return { ok: b.public === false, detail: b.public === false ? "存在且為私有（public=false）" : "⚠️ 存在但設為公開！" };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

// ── 從 Management API 取得專案金鑰與寫入 .env ──────────────────────────
// 需要 SUPABASE_ACCESS_TOKEN，且該 token 對目標專案有存取權。
async function fetchKeys(ref) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=false`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
  });
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
  const d = await res.json();
  const pick = (id) => (d.find((k) => k.id === id) || {}).api_key;
  const anon = pick("anon");
  const service = pick("service_role");
  if (!anon || !service) return { ok: false, detail: "回應中找不到 anon／service_role" };
  return { ok: true, anon, service };
}

/** 一次寫入三個值，避免新 URL 配舊金鑰的不一致狀態 */
function writeEnvFile(file, values) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n") : [];
  const done = new Set();
  const out = lines.map((l) => {
    const m = l.match(/^([A-Za-z0-9_]+)=/);
    if (m && values[m[1]] !== undefined) {
      done.add(m[1]);
      return `${m[1]}=${values[m[1]]}`;
    }
    return l;
  });
  for (const [k, v] of Object.entries(values)) {
    if (!done.has(k)) out.push(`${k}=${v}`);
  }
  fs.writeFileSync(file, out.join("\n").replace(/\n*$/, "\n"));
  return Object.keys(values);
}

// ── Render 檢查 ────────────────────────────────────────────────────────
function renderAudit() {
  const p = path.join(ROOT, "render.yaml");
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  const lines = raw.split("\n");
  const hardcoded = [];
  lines.forEach((l, i) => {
    const m = l.match(/^\s*value:\s*(https:\/\/[a-z0-9]+\.supabase\.co)\s*$/i);
    if (m) hardcoded.push({ line: i + 1, value: m[1] });
  });
  // 需要人工在 Render Dashboard 設定的（sync: false）
  const manual = [...raw.matchAll(/^\s*-\s*key:\s*([A-Z0-9_]+)\s*\n\s*sync:\s*false/gm)].map((m) => m[1]);
  return { path: p, hardcoded, manual: [...new Set(manual)], stale: hardcoded.filter((h) => h.value !== URL_) };
}

function updateRender(newUrl) {
  const p = path.join(ROOT, "render.yaml");
  const before = fs.readFileSync(p, "utf8");
  const after = before.replace(/^(\s*value:\s*)https:\/\/[a-z0-9]+\.supabase\.co\s*$/gim, `$1${newUrl}`);
  if (after === before) { console.log("  render.yaml 無需變更"); return false; }
  fs.writeFileSync(p, after);
  const n = (before.match(/https:\/\/[a-z0-9]+\.supabase\.co/gim) || []).length;
  console.log(`  render.yaml 已更新 ${n} 處 → ${newUrl}`);
  return true;
}

// ── 主流程 ─────────────────────────────────────────────────────────────
const files = sqlFiles();
const bundle = buildBundle(files);
const lint = lintSql(files);

console.log("═".repeat(72));
console.log("Supabase 一鍵重建包");
console.log("═".repeat(72));
console.log(`目標專案：${URL_ || "(未設定)"}`);
console.log(`  專案 ref  ：${projectRef || "(無法判定)"}`);
console.log(`  service key：${mask(SERVICE_KEY)}`);
console.log(`  DB 連線字串：${mask(DB_URL)}`);
console.log(`  存取權杖  ：${mask(ACCESS_TOKEN)}`);

// --url 只影響本次執行（避免把新 URL 配上舊金鑰寫進 .env 造成不一致）
if (overrideUrl && !has("--write-env")) {
  const envFile = path.join(ROOT, ".env");
  const current = fs.existsSync(envFile)
    ? (fs.readFileSync(envFile, "utf8").match(/^SUPABASE_URL=(.*)$/m) || [])[1]
    : null;
  console.log(`\n⚠️ 本次只把目標指向 ${overrideUrl}，**.env 未被修改**。`);
  if (current && current.trim() !== overrideUrl) {
    console.log(`   .env 目前仍是：${current.trim()}`);
  }
  console.log("   請自行把 .env 這三行換成新專案的值（金鑰必須同一個專案，不可混用）：");
  console.log(`     SUPABASE_URL=${overrideUrl}`);
  console.log("     SUPABASE_ANON_KEY=<新專案 Dashboard → Settings → API → anon public>");
  console.log("     SUPABASE_SERVICE_ROLE_KEY=<同上 → service_role>");
}

// 1. SQL 套用順序
console.log("\n【1】SQL 套用順序（依依賴關係，全部可重複執行）");
for (const s of files) {
  const kb = (fs.statSync(s.file).size / 1024).toFixed(1);
  console.log(`  步驟 ${s.step}：${path.basename(s.file).padEnd(48)} ${kb.padStart(7)} KB  ${s.label}`);
}
console.log(`\n  已串接產出：supabase/rebuild.sql（${(bundle.bytes / 1024).toFixed(1)} KB，可貼進 SQL Editor）`);

// 2. 靜態驗證
console.log("\n【2】SQL 靜態驗證");
console.log(`  建立表數：${lint.tables} 張${lint.tables === 28 ? "  ✅ 與 README 記載一致" : "  ⚠️ 與 README 的 28 張不符"}`);
console.log(`  alter table：${lint.alters} 個｜create index：${lint.indexes} 個｜缺 if not exists 的 create table：${lint.missingIfNotExists}`);
if (lint.alerts.length) {
  console.log("  提醒：");
  for (const a of lint.alerts) console.log(`    • ${a}`);
} else {
  console.log("  ✅ 沒有指向不存在表格的語句（不會靜默跳過）");
}

// 3. DNS
const dnsRes = await checkDns();
console.log("\n【3】DNS 解析");
console.log(`  ${dnsRes.ok ? "✅" : "❌"} ${dnsRes.detail}`);
if (!dnsRes.ok) {
  console.log("  → 專案不存在時，先到 https://supabase.com/dashboard 確認是「被暫停」（可 Restore）");
  console.log("    還是「被刪除」（需新建），再回來執行本腳本。");
}

// 4. Render 環境變數
if (has("--update-render")) {
  console.log("\n【4-前置】更新 render.yaml");
  if (!overrideUrl) {
    console.log("  ❌ 需要同時指定 --url=<新專案URL>，避免把舊值換成空的");
  } else {
    updateRender(overrideUrl);
  }
}

const ra = renderAudit();
console.log("\n【4】Render 環境變數清單");
if (!ra) {
  console.log("  找不到 render.yaml");
} else {
  if (ra.stale.length) {
    console.log(`  ⚠️ render.yaml 有 ${ra.stale.length} 處硬編碼的 URL 指向舊專案（建立新專案後必須換掉）：`);
    for (const s of ra.stale) console.log(`     第 ${s.line} 行：${s.value}`);
    console.log("     修正方式：node scripts/rebuild-supabase.mjs --update-render --url=<新專案URL>");
  } else if (ra.hardcoded.length) {
    console.log(`  ✅ render.yaml 的 ${ra.hardcoded.length} 處 URL 與目前 SUPABASE_URL 一致`);
  }
  console.log(`  需在 Render Dashboard 手動設定（sync: false）的變數 ${ra.manual.length} 個：`);
  for (const k of ra.manual) {
    const local = process.env[k];
    console.log(`     ${k.padEnd(28)} ${local ? "本機 .env 已有值，可直接複製" : "⚠️ 本機也沒有，需另外取得"}`);
  }
}

// 5. 套用
if (has("--apply") || has("--all")) {
  const route = pickApplyPath();
  console.log("\n【5】套用 schema");
  console.log(`  路徑：${route === "psql" ? "psql 直連" : route === "api" ? "Supabase Management API" : "手動（SQL Editor）"}`);
  try {
    if (route === "psql") await applyWithPsql(files);
    else if (route === "api") await applyWithApi(files);
    else {
      console.log("  ⚠️ 沒有 psql 或 SUPABASE_ACCESS_TOKEN，無法自動套用。請二選一：");
      console.log("     A) 安裝 psql 並在 .env 設 SUPABASE_DB_URL（Dashboard → Settings → Database → Connection string）");
      console.log("     B) 在 .env 設 SUPABASE_ACCESS_TOKEN（Dashboard → Account → Access Tokens）");
      console.log("     C) 打開 supabase/rebuild.sql，全選貼進 Dashboard → SQL Editor 執行");
    }
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    console.log("  → 改用路徑 C：把 supabase/rebuild.sql 貼進 SQL Editor 執行");
  }
}

// 6. 種子
if (has("--seed") || has("--all")) {
  console.log("\n【6】匯入種子資料");
  const snap = path.join(ROOT, "scripts", "published-snapshot.json");
  if (!fs.existsSync(snap)) {
    console.log("  ⚠️ 找不到 scripts/published-snapshot.json");
  } else {
    const n = (JSON.parse(fs.readFileSync(snap, "utf8")).products || []).length;
    console.log(`  來源：published-snapshot.json（${n} 筆已發布商品＋比較價格）`);
    const r = run("node", [path.join(ROOT, "scripts", "seed-supabase.js")]);
    const out = ((r.stdout || "") + (r.stderr || "")).trim();
    console.log(r.status === 0 ? `  ✅ ${out.split("\n").slice(-3).join(" / ")}` : `  ❌ 失敗：${out.slice(0, 400)}`);
  }
}

// 7. 驗收檢查表
if (has("--check") || has("--all")) {
  console.log("\n【7】驗收檢查表");
  const d = await checkDns();
  console.log(`  ${d.ok ? "✅" : "❌"} 1. DNS 解析${d.ok ? "" : `：${d.detail}`}`);

  let tablesLine = "⏭ 2. 資料表：（DNS 失敗，待專案可用後再驗）";
  if (d.ok) {
    const t = await checkTables();
    tablesLine = `${t.ok ? "✅" : "❌"} 2. 資料表：${t.detail}${t.missing.length ? `｜缺：${t.missing.join(", ")}` : ""}`;
  }
  console.log(`  ${tablesLine}`);

  if (d.ok) {
    const r = run("node", [path.join(ROOT, "scripts", "check-supabase.js")]);
    const line = ((r.stdout || "") + (r.stderr || "")).split("\n").filter(Boolean).slice(-3).join(" ");
    console.log(`  ${r.status === 0 ? "✅" : "❌"} npm run check:supabase（exit ${r.status}）：${line.slice(0, 180)}`);
  } else {
    console.log("  ⏭ npm run check:supabase（DNS 失敗，略）");
  }

  const live = await fetch("https://jp-costco-shop.onrender.com/costco/deals").then((r) => r.status).catch(() => 0);
  const liveOk = live === 200;
  console.log(`  ${liveOk ? "✅" : "❌"} 線上 /costco/deals HTTP ${live || "(連不上)"}`);

  const bucket = d.ok ? await checkBucket() : null;
  console.log(`  ${bucket === null ? "⏭" : bucket.ok ? "✅" : "❌"} 私有 bucket costco-onsite-media：${bucket ? bucket.detail : "（DNS 失敗，略）"}`);

  console.log("  ⬜ Render 環境變數已更新（含 render.yaml 的硬編碼 URL）");
  console.log("  ⬜ .env 的 SUPABASE_URL／ANON_KEY／SERVICE_ROLE_KEY 已換成新專案（三者必須同專案）");
  console.log("  ⬜ 種子資料已匯入（npm run rebuild:supabase -- --seed）");
} else if (!has("--apply") && !has("--seed")) {
  console.log("\n【後續步驟】");
  console.log("  1. 建好新專案後：node scripts/rebuild-supabase.mjs --url=<新URL> --update-render --all");
  console.log("  2. 或分段：--apply（套 schema）→ --seed（灌資料）→ --check（驗收）");
}

console.log("\n" + "═".repeat(72));
