#!/usr/bin/env node
// 待審商品核對工具：把 Supabase 裡 status=pending_review 的商品輸出成可瀏覽的核對清單，
// 讓人在一頁內做完決定（上架／不採用），再把決定套用回資料庫。
//
// 用法：
//   npm run review:pending                 # 產生 review/pending_review.html 與 .csv
//   npm run review:pending -- --open       # 產生後直接用瀏覽器開啟
//   npm run review:pending -- --apply review/pending_decisions.csv   # 套用決定
//
// 為什麼要自己判法規：每日搜尋寫入的 products 不帶 category／brand／regulation_risk
// （實測 pending 商品 273 筆中 category 有值 0 筆），若不補分類，審核者無法判斷
// 哪些商品有跨境合規風險。這裡以商品名稱（日文＋英文）套規則標記。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const OUTDIR = path.join(ROOT, "review");

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
if (!URL_ || !KEY) { console.error("缺 SUPABASE_URL／SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// ── 法規分類（只依商品名稱；與 onsite gold set 用同一組規則）─────────────
const RULES = [
  ["医薬品", /第[1-3]類医薬品|指定第[②1-3]類|医薬品|ロキソニン|パブロン|イブ|葛根湯|アレジオン/],
  ["医薬部外品", /医薬部外品|ワカモト|龍角散|ビューラック/],
  ["化粧品", /化粧品|化粧水|美容液|乳液|クリーム|ファンデ|口紅|マスカラ|UV|日焼け止め|シャンプー|コンディショナー|ヘア/],
  ["医療機器", /コンタクト|医療機器|血圧計|体温計|ネブライザ|マスク|絆創膏|湿布|サポーター/],
  ["酒類", /ビール|ワイン|日本酒|焼酎|ウイスキー|チューハイ|スパークリング|梅酒|泡盛/],
  ["保健食品", /サプリ|サプリメント|プロテイン|青汁|健康食品|ビタミン|酵素|コラーゲン|グルコサミン|DHA|EPA|乳酸菌|カルシウム|鉄分/],
  ["食品", /食品|お菓子|菓子|チョコ|クッキー|ビスケット|スナック|米|パスタ|麺|パン|シリアル|ジャム|ソース|ドレッシング|調味|レトルト|缶詰|のり|ふりかけ|コーヒー|紅茶|お茶|ジュース|ミルク|ゼリー|飴|ガム|ナッツ|ドライフルーツ/],
  ["危険物", /エアゾール|スプレー|ライター|ガス|燃料|殺虫剤|漂白剤|カビ取り/],
  ["リチウム電池", /リチウム|電池|バッテリー|モバイルバッテリー|充電池|充電器/],
  ["液体", /液体|オイル|ローション|洗剤|柔軟剤|飲料|ソース|シャンプー|リンス|漂白/],
];
const HIGH = new Set(["医薬品", "化粧品", "医療機器", "酒類", "危険物", "リチウム電池"]);

function classify(p) {
  const hay = `${p.jp_name || ""} ${p.english_name || ""}`;
  const flags = RULES.filter(([, re]) => re.test(hay)).map(([n]) => n);
  const high = flags.filter((f) => HIGH.has(f));
  return {
    flags,
    risk: high.length ? "high" : flags.length ? "medium" : "low",
  };
}

// ── 取資料 ─────────────────────────────────────────────────────────────
async function fetchPending() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(
      `${URL_}/rest/v1/products?select=id,jp_name,english_name,jp_price,discount_price,score,` +
      `evidence_type,image_url,costco_url,regulation_risk,rating,review_count,` +
      `suitable_for_import,search_batch_id,updated_at&status=eq.pending_review&order=score.desc&limit=1000&offset=${offset}`,
      { headers: H }
    );
    if (!res.ok) throw new Error(`讀取待審商品失敗：${res.status} ${(await res.text()).slice(0, 200)}`);
    const chunk = await res.json();
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}

// ── 產生 HTML ──────────────────────────────────────────────────────────
function buildHtml(items) {
  // JSON 內嵌時把 < 轉成 \u003c，避免商品名稱含 </script> 之類字串破壞 HTML
  const payload = JSON.stringify(items).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>待審商品核對（${items.length} 筆）</title>
<style>
:root{--bg:#14161a;--panel:#1d2026;--line:#2e333c;--fg:#e8eaed;--dim:#9aa3af;--ok:#3ddc84;--warn:#ffb020;--bad:#ff5c5c;--acc:#4c9ffe}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,"Helvetica Neue",Arial,sans-serif}
header{position:sticky;top:0;z-index:9;background:rgba(20,22,26,.97);border-bottom:1px solid var(--line);padding:10px 14px;display:flex;gap:9px;flex-wrap:wrap;align-items:center}
h1{font-size:15px;margin:0;font-weight:600}
button{background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:6px 11px;font-size:13px;cursor:pointer}
button:hover{border-color:var(--acc)}button.p{background:var(--acc);border-color:var(--acc);color:#08121f;font-weight:600}
button.on{border-color:var(--acc);background:#12283a;color:#cfe6ff}
.bar{flex:1;min-width:110px;height:7px;background:#252a32;border-radius:4px;overflow:hidden}.bar>i{display:block;height:100%;background:var(--ok);width:0}
.stat{color:var(--dim);font-size:13px;font-variant-numeric:tabular-nums}
main{padding:14px;display:grid;gap:13px;grid-template-columns:repeat(auto-fill,minmax(400px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.card.no{border-color:#7a2d2d;opacity:.55}.card.yes{border-color:#2f6b49}
.imgwrap{background:#0c0e11;height:200px;display:flex;align-items:center;justify-content:center}
.imgwrap img{max-width:100%;max-height:200px;cursor:zoom-in}
.head{padding:9px 11px;display:flex;gap:7px;align-items:baseline;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.fn{font-weight:600;font-size:13.5px;line-height:1.35}
.tag{font-size:11px;padding:1px 6px;border-radius:5px;background:#262b33;color:var(--dim)}
.tag.w{background:#3a2d12;color:var(--warn)}.tag.i{background:#12283a;color:var(--acc)}.tag.d{background:#3a1d1d;color:#ffb4b4}
.body{padding:9px 11px;font-size:13px;color:var(--dim);display:grid;gap:4px}
.price{color:#ffd479;font-weight:700;font-size:15px}
.row{display:flex;gap:7px;flex-wrap:wrap;padding:9px 11px;border-top:1px solid var(--line)}
.row button{flex:1}
.row button[aria-pressed=true]{border-color:var(--ok);background:#1a3327;color:#bff5d6}
.row button.no[aria-pressed=true]{border-color:var(--bad);background:#3a1d1d;color:#ffd2d2}
a{color:var(--acc);font-size:12px}
</style></head><body>
<header>
  <h1>待審商品核對</h1>
  <div class="bar"><i id="pb"></i></div><span class="stat" id="st"></span>
  <button id="fTodo" class="on">未決定</button>
  <button id="fHigh">高法規風險</button>
  <button id="fNoPrice">無價格</button>
  <button id="fLow">低分</button>
  <button id="fAll">全部</button>
  <button class="p" id="exp">匯出決定 CSV</button>
  <button id="clr">清除</button>
</header>
<main id="list"></main>
<script id="data" type="application/json">${payload}</script>
<script>
const DATA=JSON.parse(document.getElementById('data').textContent);
const KEY='pending_review_v1';
let state;try{state=JSON.parse(localStorage.getItem(KEY)||'null')||{};}catch(e){state={};}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}};
const get=d=>(state[d.id]=state[d.id]||{});
let filter='todo';
const list=document.getElementById('list');
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const visible=d=>{const s=get(d);
  if(filter==='all')return true; if(filter==='todo')return !s.decision;
  if(filter==='high')return !s.decision&&d.risk==='high';
  if(filter==='noprice')return !s.decision&&!d.jp_price;
  if(filter==='low')return !s.decision&&(d.score||0)<40; return true;};
function progress(){const done=DATA.filter(d=>get(d).decision).length;
  document.getElementById('pb').style.width=(done/DATA.length*100).toFixed(1)+'%';
  document.getElementById('st').textContent=done+' / '+DATA.length+' 已決定';}
function render(){progress();list.innerHTML='';
  for(const d of DATA.filter(visible)){
    const s=get(d);const el=document.createElement('section');
    el.className='card'+(s.decision==='reject'?' no':s.decision==='approve'?' yes':'');
    el.innerHTML=\`
      <div class="imgwrap">\${d.image_url?\`<img loading="lazy" src="\${esc(d.image_url)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{textContent:'圖片載入失敗',className:'stat'}))">\`:'<div class="stat">無圖片</div>'}</div>
      <div class="head"><span class="fn">\${esc(d.jp_name)}</span></div>
      <div class="body">
        \${d.english_name?\`<div>\${esc(d.english_name)}</div>\`:''}
        <div><span class="price">\${d.jp_price?('¥'+Number(d.jp_price).toLocaleString('ja-JP')):'（無價格）'}</span>
          \${d.discount_price?\` <span class="stat">原價 ¥\${Number(d.discount_price).toLocaleString('ja-JP')}</span>\`:''}</div>
        <div><span class="tag">分數 \${esc(d.score)}</span> <span class="tag">\${esc(d.evidence_type||'')}</span>
          \${d.rating?\`<span class="tag">★\${esc(d.rating)}（\${esc(d.review_count||0)}）</span>\`:''}
          \${d.flags.map(f=>\`<span class="tag \${d.risk==='high'?'d':'w'}">\${esc(f)}</span>\`).join(' ')}
          \${d.risk==='high'?'<span class="tag d">高法規風險</span>':''}</div>
        <div>ID \${esc(d.id)}\${d.costco_url?\` · <a href="\${esc(d.costco_url)}" target="_blank">官方頁面</a>\`:''}</div>
      </div>
      <div class="row">
        <button data-v="approve">✓ 上架</button>
        <button class="no" data-v="reject">✕ 不採用</button>
      </div>\`;
    el.querySelectorAll('.row button').forEach(b=>{
      b.setAttribute('aria-pressed',s.decision===b.dataset.v?'true':'false');
      b.onclick=()=>{const cur=get(d);
        cur.decision=(cur.decision===b.dataset.v)?'':b.dataset.v;save();
        el.className='card'+(cur.decision==='reject'?' no':cur.decision==='approve'?' yes':'');
        el.querySelectorAll('.row button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.v===cur.decision?'true':'false'));
        progress();if(filter!=='all'&&cur.decision)setTimeout(()=>el.remove(),120);};
    });
    el.querySelectorAll('.imgwrap img').forEach(i=>{i.onclick=()=>window.open(i.src,'_blank');});
    list.appendChild(el);
  }}
document.getElementById('exp').onclick=()=>{
  const lines=['id,decision,jp_name,jp_price,score,evidence_type,regulation_flags,image_url,costco_url'];
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  for(const d of DATA){const s=get(d);
    lines.push([d.id,s.decision||'',d.jp_name,d.jp_price,d.score,d.evidence_type,d.flags.join('|'),d.image_url,d.costco_url].map(q).join(','));}
  const blob=new Blob(['\\ufeff'+lines.join('\\r\\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='pending_decisions.csv';a.click();};
document.getElementById('clr').onclick=()=>{if(confirm('清除本機決定？（請先匯出）')){state={};save();render();}};
for(const [id,f] of [['fTodo','todo'],['fHigh','high'],['fNoPrice','noprice'],['fLow','low'],['fAll','all']]){
  document.getElementById(id).onclick=()=>{filter=f;render();
    document.querySelectorAll('header button').forEach(b=>b.classList.remove('on'));
    document.getElementById(id).classList.add('on');};}
render();
</script></body></html>`;
}

// ── 模式：匯出 ─────────────────────────────────────────────────────────
async function doExport(open) {
  const rows = await fetchPending();
  const items = rows.map((p) => {
    const c = classify(p);
    return { ...p, flags: c.flags, risk: c.risk };
  });
  const high = items.filter((i) => i.risk === "high").length;
  const noPrice = items.filter((i) => !i.jp_price).length;

  fs.mkdirSync(OUTDIR, { recursive: true });
  const html = buildHtml(items);
  fs.writeFileSync(path.join(OUTDIR, "pending_review.html"), html);

  const cols = ["id", "jp_name", "english_name", "jp_price", "discount_price", "score",
    "evidence_type", "regulation_flags", "regulation_risk", "image_url", "costco_url"];
  const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const lines = [cols.join(",")];
  for (const i of items) {
    lines.push([i.id, i.jp_name, i.english_name, i.jp_price, i.discount_price, i.score,
      i.evidence_type, i.flags.join("|"), i.risk, i.image_url, i.costco_url].map(q).join(","));
  }
  fs.writeFileSync(path.join(OUTDIR, "pending_review.csv"), "\ufeff" + lines.join("\r\n"));

  console.log("═".repeat(64));
  console.log("待審商品核對清單");
  console.log("═".repeat(64));
  console.log(`  待審商品        : ${items.length} 筆`);
  console.log(`  高法規風險      : ${high} 筆（医薬品／化粧品／医療機器／酒類／危険物／リチウム）`);
  console.log(`  無價格          : ${noPrice} 筆`);
  console.log(`  輸出            : review/pending_review.html（可瀏覽）`);
  console.log(`                    review/pending_review.csv（試算表）`);
  console.log();
  console.log("  在 HTML 裡逐筆按「上架／不採用」→ 按「匯出決定 CSV」");
  console.log("  然後：npm run review:pending -- --apply <匯出的 CSV 路徑>");
  console.log();
  const risk = items.reduce((a, i) => (a[i.risk] = (a[i.risk] || 0) + 1, a), {});
  console.log(`  法規風險分布    : 高 ${risk.high || 0}｜中 ${risk.medium || 0}｜低 ${risk.low || 0}`);
  const byEv = items.reduce((a, i) => (a[i.evidence_type] = (a[i.evidence_type] || 0) + 1, a), {});
  console.log(`  來源分布        : ${Object.entries(byEv).map(([k, v]) => `${k} ${v}`).join("｜")}`);

  if (open) execFileSync("open", [path.join(OUTDIR, "pending_review.html")]);
}

// ── 模式：套用決定 ─────────────────────────────────────────────────────
async function doApply(csvPath) {
  if (!fs.existsSync(csvPath)) { console.error(`找不到 ${csvPath}`); process.exit(1); }
  const text = fs.readFileSync(csvPath, "utf8").replace(/^\ufeff/, "");
  const rows = [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",").map((s) => s.trim());
  const iId = head.indexOf("id"), iDec = head.indexOf("decision");
  if (iId < 0 || iDec < 0) { console.error("CSV 需含 id 與 decision 欄位"); process.exit(1); }
  for (const l of lines.slice(1)) {
    // 逐欄解析（支援引號內逗號）
    const cells = []; let cur = "", inQ = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (inQ && l[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push({ id: cells[iId], decision: (cells[iDec] || "").trim() });
  }
  const approve = rows.filter((r) => r.decision === "approve").map((r) => r.id);
  const reject = rows.filter((r) => r.decision === "reject").map((r) => r.id);
  const undecided = rows.filter((r) => !r.decision).length;

  console.log(`  上架 ${approve.length}｜不採用 ${reject.length}｜未決定 ${undecided}`);
  if (!approve.length && !reject.length) { console.log("沒有決定可套用"); return; }

  const post = async (path, body, prefer = "return=minimal") => {
    const res = await fetch(`${URL_}${path}`, { method: "POST", headers: { ...H, Prefer: prefer }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  };
  const patch = async (query, body) => {
    const res = await fetch(`${URL_}/rest/v1/products?${query}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`PATCH → ${res.status} ${(await res.text()).slice(0, 200)}`);
  };

  if (approve.length) {
    const date = new Date().toISOString().slice(0, 10);
    const coll = `${date}-costco-japan-top${approve.length}`;
    // 與 lib/publish.ts 的 publishCollection 同一步驟
    await post("/rest/v1/published_collections", [{ id: coll, title: `日本 Costco 精選 ${date}` }], "resolution=merge-duplicates,return=minimal");
    await patch(`id=in.(${approve.join(",")})`, { status: "published", updated_at: new Date().toISOString() });
    await post("/rest/v1/published_collection_items",
      approve.map((id, i) => ({ collection_id: coll, product_id: id, rank: i + 1 })));
    await post("/rest/v1/audit_logs",
      [{ actor: "admin", action: "collection_published", entity_type: "published_collection", entity_id: coll, detail: `count=${approve.length}（人工核對清單套用）` }]);
    console.log(`  ✅ 已上架 ${approve.length} 筆（collection: ${coll}）`);
  }
  if (reject.length) {
    await patch(`id=in.(${reject.join(",")})`, { status: "rejected", updated_at: new Date().toISOString() });
    console.log(`  ✅ 已標記不採用 ${reject.length} 筆（status=rejected，不再出現在待審）`);
  }
}

// ── 入口 ───────────────────────────────────────────────────────────────
const applyIdx = args.indexOf("--apply");
if (applyIdx >= 0) {
  const p = args[applyIdx + 1];
  if (!p) { console.error("用法：--apply <CSV 路徑>"); process.exit(1); }
  await doApply(path.resolve(p));
} else {
  await doExport(args.includes("--open"));
}
