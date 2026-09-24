// 資料層健檢：檢查 Supabase 專案是否存在、金鑰是否有效、Graph/2.0 資料表是否齊全。
// 用法：node scripts/check-supabase.js [--json]
const fs = require("node:fs");
const path = require("node:path");
const dns = require("node:dns/promises");
const net = require("node:net");

const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const RAW_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const asJson = process.argv.includes("--json");

// 期望存在於 Supabase 的資料表：直接從 schema.sql 與 migrations 解析，避免清單過期。
function expectedTables() {
  const sources = [
    path.join(root, "supabase", "schema.sql"),
    ...fs
      .readdirSync(path.join(root, "supabase", "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => path.join(root, "supabase", "migrations", f))
  ];
  const tables = new Map();
  for (const file of sources) {
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, "utf8");
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi;
    let m;
    while ((m = re.exec(sql))) {
      if (!tables.has(m[1])) tables.set(m[1], path.relative(root, file));
    }
  }
  return tables;
}

async function main() {
  const report = { url: RAW_URL, host: null, dns: null, rest: null, missing: [], checked: 0 };
  const problems = [];

  if (!RAW_URL) {
    console.error("✗ .env 缺少 SUPABASE_URL，無法檢查。");
    process.exit(1);
  }
  try {
    report.host = new URL(RAW_URL).hostname;
  } catch (e) {
    console.error(`✗ SUPABASE_URL 格式錯誤：${RAW_URL}`);
    process.exit(1);
  }

  // 1) DNS：專案被刪除或 ref 改名時，網域會直接解析不到。
  if (net.isIP(report.host)) {
    report.dns = { ok: true, addresses: [report.host], skipped: "ip literal" };
  } else {
    try {
      const addrs = await dns.resolve4(report.host);
      report.dns = { ok: true, addresses: addrs };
    } catch (e) {
      report.dns = { ok: false, error: e.code || e.message };
      problems.push(`DNS 解析失敗（${e.code || e.message}）：${report.host} 不存在，專案可能已被刪除或改名。`);
    }
  }

  // 2) REST + 金鑰
  const keyForRest = SERVICE_KEY || ANON_KEY;
  if (!report.dns.ok) {
    report.rest = { ok: false, error: "skipped: dns failed" };
  } else if (!keyForRest) {
    report.rest = { ok: false, error: "skipped: no key" };
    problems.push("缺少 SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY，無法驗證資料層。");
  } else {
    try {
      const res = await fetch(`${RAW_URL}/rest/v1/`, { headers: { apikey: keyForRest } });
      report.rest = { ok: res.ok || res.status === 404, status: res.status };
      if (res.status === 401 || res.status === 403) {
        problems.push(`REST 金鑰被拒（HTTP ${res.status}）：service_role key 已失效或與專案不符。`);
      } else if (res.status >= 500) {
        problems.push(`REST 回應 HTTP ${res.status}：專案存在但服務異常。`);
      }
    } catch (e) {
      report.rest = { ok: false, error: e.message };
      problems.push(`REST 連線失敗：${e.message}`);
    }
  }

  // 3) 資料表齊全度（service_role 需可讀）
  const tables = expectedTables();
  if (report.rest.ok && SERVICE_KEY) {
    for (const [table, source] of tables) {
      report.checked++;
      try {
        const res = await fetch(`${RAW_URL}/rest/v1/${table}?limit=0`, { headers: { apikey: SERVICE_KEY } });
        const body = res.ok ? "" : await res.text();
        const missing = res.status === 404 || body.includes("PGRST205");
        if (!res.ok && !missing) {
          report.missing.push({ table, source, reason: `HTTP ${res.status}` });
        } else if (missing) {
          report.missing.push({ table, source, reason: "不存在" });
        }
      } catch (e) {
        report.missing.push({ table, source, reason: e.message });
      }
    }
    if (report.missing.length) {
      const sources = [...new Set(report.missing.map((m) => m.source))].join("、");
      problems.push(`缺少 ${report.missing.length} 張資料表（需套用：${sources}）。`);
    }
  }

  const ok = problems.length === 0;

  if (asJson) {
    console.log(JSON.stringify({ ...report, problems, ok }, null, 2));
  } else {
    console.log(`Supabase：${RAW_URL}`);
    console.log(`  1. DNS      ${report.dns?.ok ? "✓ " + report.dns.addresses.join(", ") : "✗ " + report.dns?.error}`);
    console.log(`  2. REST     ${report.rest?.ok ? "✓ HTTP " + report.rest.status : "✗ " + report.rest?.error}`);
    console.log(`  3. 資料表   ${report.rest?.ok && SERVICE_KEY ? `✓ ${report.checked - report.missing.length}/${report.checked} 存在` : "（略過）"}`);
    if (report.missing.length) {
      for (const m of report.missing) console.log(`       ✗ ${m.table}（${m.reason}；來源 ${m.source}）`);
    }
    console.log("");
    if (ok) {
      console.log("結論：資料層正常。");
    } else {
      console.log("結論：資料層有問題 ——");
      for (const p of problems) console.log(`  • ${p}`);
      console.log("\n復原步驟見 README「資料層健檢與復原」。");
    }
  }

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("檢查失敗:", e);
  process.exit(1);
});
