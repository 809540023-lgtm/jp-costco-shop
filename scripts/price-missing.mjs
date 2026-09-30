#!/usr/bin/env node
// 缺定價商品 → 人工核定售價。
//
// 為什麼需要這支：已發布商品中有一批（現場照片來源）依規則「不推估價格」而沒有
// taiwan_suggested_price，前端只能顯示「未定價」也無法訂購；但專案原本沒有任何
// 把售價補回去的路徑（Agent 5 只處理通過門檻的候選）。這裡提供人工核價清單：
// 產生參考價 → 人填/確認 → `--apply <CSV>` 才寫入（售價絕不自動產生）。
//
// 用法：
//   npm run price:missing                 # 產生 review/missing_prices.html 與 .csv
//   npm run price:missing -- --open       # 產生後開啟瀏覽器
//   npm run price:missing -- --apply review/missing_prices.csv        # 寫入售價
//   npm run price:missing -- --apply <CSV> --dry-run                  # 只顯示會寫什麼（不寫入）
//   npm run price:missing -- --apply review/missing_prices.csv --force # 覆寫已定價者
//
// 參考價 = 日幣現行價 × JPY_TWD_RATE（與 lib/graph/listing-draft.ts 同一組匯率），
// 未含國際運費與關稅，只是給人判斷的起點。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  REFERENCE_NOTE,
  currentJpy,
  needsPricing,
  parsePriceCsv,
  planPriceUpdates,
  referenceTwdFor,
  regularJpy
} from "./lib/pricing.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTDIR = path.join(ROOT, "review");
const args = process.argv.slice(2);
const force = args.includes("--force");

// ── .env ───────────────────────────────────────────────────────────────
function loadEnv() {
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) return;
  for (const l of fs.readFileSync(p, "utf8").split("\n")) {
    const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();
const URL_ = process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!URL_ || !KEY) {
  console.error("缺 SUPABASE_URL／SUPABASE_SERVICE_ROLE_KEY（請設定於 .env）");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// ── 取資料 ─────────────────────────────────────────────────────────────
const SELECT =
  "id,jp_name,zh_name,english_name,jp_price,discount_price,taiwan_suggested_price," +
  "evidence_type,image_url,costco_url,updated_at";

async function fetchPublished() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(
      `${URL_}/rest/v1/products?select=${SELECT}&status=eq.published&order=taiwan_suggested_price.asc.nullslast,jp_name.asc&limit=1000&offset=${offset}`,
      { headers: H }
    );
    if (!res.ok) throw new Error(`讀取已發布商品失敗：${res.status} ${(await res.text()).slice(0, 200)}`);
    const chunk = await res.json();
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}

// ── 匯出 ───────────────────────────────────────────────────────────────
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(items) {
  const head = ["id", "jp_name", "english_name", "jp_price", "regular_price", "reference_twd", "twd_price", "evidence_type", "costco_url"];
  const lines = [head.join(",")];
  for (const p of items) {
    lines.push([
      p.id,
      p.jp_name,
      p.english_name,
      currentJpy(p) ?? "",
      regularJpy(p) ?? "",
      referenceTwdFor(p) ?? "",
      "",
      p.evidence_type,
      p.costco_url
    ].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function buildHtml(items) {
  const payload = JSON.stringify(items.map((p) => ({
    id: p.id,
    name: p.zh_name || p.jp_name,
    jp: p.jp_name,
    en: p.english_name,
    img: p.image_url,
    url: p.costco_url,
    jpy: currentJpy(p),
    regular: regularJpy(p),
    ref: referenceTwdFor(p),
    source: p.evidence_type
  }))).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>缺定價核價（${items.length} 筆）</title>
<style>
:root{--bg:#14161a;--panel:#1d2026;--line:#2e333c;--fg:#e8eaed;--dim:#9aa3af;--ok:#3ddc84;--acc:#4c9ffe;--gold:#ffd479}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,"Helvetica Neue",Arial,sans-serif}
header{position:sticky;top:0;z-index:9;background:rgba(20,22,26,.97);border-bottom:1px solid var(--line);padding:10px 14px;display:flex;gap:9px;flex-wrap:wrap;align-items:center}
h1{font-size:15px;margin:0;font-weight:600}
button{background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:6px 11px;font-size:13px;cursor:pointer}
button:hover{border-color:var(--acc)}button.p{background:var(--acc);border-color:var(--acc);color:#08121f;font-weight:600}
.bar{flex:1;min-width:110px;height:7px;background:#252a32;border-radius:4px;overflow:hidden}.bar>i{display:block;height:100%;background:var(--ok);width:0}
.stat{color:var(--dim);font-size:13px;font-variant-numeric:tabular-nums}
.note{color:var(--dim);font-size:12px;padding:8px 14px;border-bottom:1px solid var(--line)}
main{padding:14px;display:grid;gap:13px;grid-template-columns:repeat(auto-fill,minmax(380px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.card.done{border-color:#2f6b49}
.imgwrap{background:#0c0e11;height:190px;display:flex;align-items:center;justify-content:center}
.imgwrap img{max-width:100%;max-height:190px;cursor:zoom-in}
.head{padding:9px 11px;display:flex;gap:7px;align-items:baseline;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.fn{font-weight:600;font-size:13.5px;line-height:1.35}
.tag{font-size:11px;padding:1px 6px;border-radius:5px;background:#262b33;color:var(--dim)}
.body{padding:9px 11px;font-size:13px;color:var(--dim);display:grid;gap:5px}
.jpy{color:var(--gold);font-weight:700;font-size:15px}
.ref{color:#9fd8ff;font-weight:600}
.row{display:flex;gap:7px;flex-wrap:wrap;padding:9px 11px;border-top:1px solid var(--line);align-items:center}
input{flex:1;min-width:110px;background:#0f1115;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:7px 9px;font-size:14px;font-variant-numeric:tabular-nums}
input:focus{outline:none;border-color:var(--acc)}
a{color:var(--acc);font-size:12px}
</style></head><body>
<header>
  <h1>缺定價核價</h1>
  <div class="bar"><i id="pb"></i></div><span class="stat" id="st"></span>
  <button id="fillAll">全部填入參考價</button>
  <button class="p" id="exp">匯出 CSV</button>
  <button id="clr">清除</button>
</header>
<div class="note">參考價 = ${REFERENCE_NOTE}。填好後按「匯出 CSV」，再執行 <code>npm run price:missing -- --apply &lt;CSV 路徑&gt;</code> 才會寫入資料庫。</div>
<main id="list"></main>
<script>
const DATA=${payload};
const KEY='jp_costco_prices';
let state={};try{state=JSON.parse(localStorage.getItem(KEY)||'null')||{};}catch(e){state={};}
if(Array.isArray(state))state={};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}};
const val=d=>state[d.id]??'';
function progress(){const n=DATA.filter(d=>Number(val(d))>0).length;
  const total=DATA.length;
  document.getElementById('pb').style.width=(total?(n/total*100):0)+'%';
  document.getElementById('st').textContent=n+' / '+total+' 已填價（總額 NT$'+DATA.reduce((s,d)=>s+(Number(val(d))||0),0).toLocaleString()+'）';}
function render(){
  const list=document.getElementById('list');list.textContent='';
  for(const d of DATA){
    const el=document.createElement('div');el.className='card'+(Number(val(d))>0?' done':'');
    const img=d.img?'<img src="'+d.img+'" alt="" loading="lazy">':'🛍️';
    el.innerHTML='<div class="imgwrap">'+img+'</div>'+
      '<div class="head"><span class="fn">'+esc(d.name)+'</span><span class="tag">'+esc(d.source||'')+'</span></div>'+
      '<div class="body">'+
        '<div>'+esc(d.jp||'')+(d.en?' <span style="opacity:.7">('+esc(d.en)+')</span>':'')+'</div>'+
        '<div class="jpy">日本現行價 '+(d.jpy!=null?'¥'+d.jpy.toLocaleString():'—')+
          (d.regular!=null?'　<span style="color:var(--dim);font-weight:400">促銷前 ¥'+d.regular.toLocaleString()+'</span>':'')+'</div>'+
        '<div class="ref">參考價 '+(d.ref!=null?'NT$'+d.ref.toLocaleString():'無法計算（無日幣價）')+'</div>'+
        (d.url?'<a href="'+d.url+'" target="_blank" rel="noreferrer">官方商品頁</a>':'')+
      '</div>'+
      '<div class="row"><input type="number" min="1" step="1" inputmode="numeric" placeholder="台幣售價" value="'+esc(val(d))+'">'+
      (d.ref!=null?'<button data-ref="'+d.ref+'">採用參考價</button>':'')+'</div>';
    const input=el.querySelector('input');
    input.oninput=()=>{const v=input.value.trim();if(v)state[d.id]=v;else delete state[d.id];save();el.classList.toggle('done',Number(v)>0);progress();};
    const rb=el.querySelector('button[data-ref]');
    if(rb)rb.onclick=()=>{input.value=rb.dataset.ref;state[d.id]=rb.dataset.ref;save();el.classList.add('done');progress();};
    list.appendChild(el);
  }
  progress();
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
document.getElementById('fillAll').onclick=()=>{if(!confirm('把所有未填的項目填入參考價？'))return;
  for(const d of DATA)if(!(Number(val(d))>0)&&d.ref!=null)state[d.id]=String(d.ref);save();render();};
document.getElementById('clr').onclick=()=>{if(confirm('清除本機填寫內容？（請先匯出 CSV）')){state={};save();render();}};
document.getElementById('exp').onclick=()=>{
  const head=['id','jp_name','english_name','jp_price','regular_price','reference_twd','twd_price','evidence_type','costco_url'];
  const cell=v=>{const s=v==null?'':String(v);return /[",\\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const lines=[head.join(',')];
  for(const d of DATA)lines.push([d.id,d.jp,d.en,d.jpy??'',d.regular??'',d.ref??'',val(d),d.source,d.url].map(cell).join(','));
  const blob=new Blob([lines.join('\\n')+'\\n'],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='missing_prices.csv';a.click();
};
render();
</script></body></html>`;
}

async function doExport(open) {
  const published = await fetchPublished();
  const items = published.filter(needsPricing);
  const withRef = items.filter((p) => referenceTwdFor(p) != null).length;

  fs.mkdirSync(OUTDIR, { recursive: true });
  const csvPath = path.join(OUTDIR, "missing_prices.csv");
  const htmlPath = path.join(OUTDIR, "missing_prices.html");
  fs.writeFileSync(csvPath, toCsv(items));
  fs.writeFileSync(htmlPath, buildHtml(items));

  console.log("缺定價核價清單");
  console.log("═".repeat(64));
  console.log(`  已發布商品      : ${published.length} 筆`);
  console.log(`  缺台幣定價      : ${items.length} 筆`);
  console.log(`  可算參考價      : ${withRef} 筆（無日幣價者 ${items.length - withRef} 筆，需自行定價）`);
  console.log(`  參考價說明      : ${REFERENCE_NOTE}`);
  console.log(`  輸出            : ${path.relative(ROOT, htmlPath)}（可瀏覽）`);
  console.log(`                    ${path.relative(ROOT, csvPath)}（試算表）`);
  console.log("");
  console.log("  在 HTML 填好售價 → 「匯出 CSV」→");
  console.log("  npm run price:missing -- --apply <匯出的 CSV 路徑>");

  if (open) {
    try {
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      execFileSync(cmd, [htmlPath], { stdio: "ignore" });
    } catch {
      console.log(`  （無法自動開啟，請手動開 ${htmlPath}）`);
    }
  }
}

// ── 模式：套用售價 ─────────────────────────────────────────────────────
async function doApply(csvPath) {
  if (!fs.existsSync(csvPath)) { console.error(`找不到 ${csvPath}`); process.exit(1); }
  const { rows, error } = parsePriceCsv(fs.readFileSync(csvPath, "utf8"));
  if (error) { console.error(error); process.exit(1); }

  const published = await fetchPublished();
  const { updates, skipped } = planPriceUpdates(published, rows, { force });

  const byReason = {};
  for (const s of skipped) byReason[s.reason] = (byReason[s.reason] || 0) + 1;
  const reasonText = {
    missing_id: "沒有 id",
    not_published: "不是已發布商品（可能已下架）",
    invalid_price: "售價不是正整數（空白視為未填）",
    already_priced: "已有定價（要覆寫請加 --force）"
  };

  console.log("套用售價");
  console.log("═".repeat(64));
  console.log(`  可寫入          : ${updates.length} 筆`);
  for (const [reason, n] of Object.entries(byReason)) {
    console.log(`  略過            : ${n} 筆（${reasonText[reason] || reason}）`);
  }
  for (const u of updates.slice(0, 5)) {
    console.log(`  + ${u.id}  NT$${u.from ?? "未定價"} → NT$${u.price}`);
  }
  if (updates.length > 5) console.log(`  …其餘 ${updates.length - 5} 筆`);

  if (!updates.length) { console.log("\n沒有可寫入的售價。"); return; }
  if (args.includes("--dry-run")) { console.log("\n（--dry-run：未寫入）"); return; }

  const now = new Date().toISOString();
  for (const u of updates) {
    const res = await fetch(`${URL_}/rest/v1/products?id=eq.${encodeURIComponent(u.id)}`, {
      method: "PATCH",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ taiwan_suggested_price: u.price, updated_at: now })
    });
    if (!res.ok) throw new Error(`寫入 ${u.id} 失敗：${res.status} ${(await res.text()).slice(0, 200)}`);
  }

  const logs = updates.map((u) => ({
    actor: "admin",
    action: "product_priced",
    entity_type: "product",
    entity_id: u.id,
    detail: `taiwan_suggested_price ${u.from ?? "null"} → ${u.price}（人工核定，來源 ${path.basename(csvPath)}）`
  }));
  for (let i = 0; i < logs.length; i += 200) {
    const res = await fetch(`${URL_}/rest/v1/audit_logs`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify(logs.slice(i, i + 200))
    });
    if (!res.ok) throw new Error(`寫入 audit_logs 失敗：${res.status} ${(await res.text()).slice(0, 200)}`);
  }

  console.log(`\n✅ 已寫入 ${updates.length} 筆售價（audit_logs 已記錄，可追溯）。`);
  console.log("   前端重新整理即可看到價格（未定價商品會開始顯示台幣售價並開放訂購）。");
}

// ── 入口 ───────────────────────────────────────────────────────────────
const applyIdx = args.indexOf("--apply");
try {
  if (applyIdx >= 0) {
    const p = args[applyIdx + 1];
    if (!p) { console.error("用法：--apply <CSV 路徑>"); process.exit(1); }
    await doApply(path.resolve(p));
  } else {
    await doExport(args.includes("--open"));
  }
} catch (e) {
  console.error(`失敗：${e.message}`);
  process.exit(1);
}
