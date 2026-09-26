#!/usr/bin/env node
// 把現場照片 gold set 轉成 products 表可匯入的種子資料。
//
// 資料來源（在 repo 外，預設 ~/Desktop/好市多２０２６０９-goldset）：
//   product_master.json   每商品一列的跨境/法規判定
//   official_matches.json 官方目錄比對（價格／評分／庫存／字面證據）
//
// 依 AGENTS.md 的硬規則：
//   - 搜尋/匯入結果一律 status='pending_review'，不直接上架
//   - 缺值欄位一律省略，不寫 null
//   - 單一價格不構成特價 → 不寫 discount_price（現場價牌未經人工 VERIFIED）
//   - 不推估價格／運費／關稅（taiwan_suggested_price、logistics_cost、landed_cost 一律不寫）
//   - 不寫 GPS、不寫照片檔名與 Drive 連結（清冊類資料只進私人 Queue）
//
// 用法：
//   node scripts/seed-onsite-products.mjs                       # 產生種子檔並顯示摘要
//   node scripts/seed-onsite-products.mjs --post                 # 產生後直接 upsert 進 Supabase
//   node scripts/seed-onsite-products.mjs --in=<路徑> --out=<路徑>
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argValue = (k, d = "") => {
  const m = args.find((a) => a.startsWith(`${k}=`));
  return m ? m.slice(k.length + 1) : d;
};
const IN = argValue("--in", path.join(os.homedir(), "Desktop", "好市多２０２６０９-goldset"));
const OUT = argValue("--out", path.join(ROOT, "scripts", "onsite-products-seed.json"));
const BATCH = argValue("--batch", "onsite-2026-08-31");

// products 表的欄位白名單：只輸出這些，其餘一律不寫（避免把未知欄位打進 PostgREST）。
const ALLOWED = new Set([
  "id", "jp_name", "zh_name", "english_name", "brand", "category", "spec",
  "description", "summary", "features", "jan_code", "costco_url", "image_url",
  "jp_price", "discount_price", "price_confirmed_at", "in_stock", "is_hot_buy",
  "is_new", "rating", "review_count", "evidence_source", "evidence_type",
  "japan_exclusive_note", "taiwan_demand", "taiwan_suggested_price",
  "logistics_cost", "landed_cost", "regulation_risk", "suitable_for_import",
  "procurement_note", "status", "score", "search_batch_id", "created_at", "updated_at"
]);

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const master = readJson(path.join(IN, "product_master.json"));
const matches = readJson(path.join(IN, "official_matches.json"));
const matchByCluster = new Map(matches.map((m) => [m.cluster, m]));

/** 省略空值：undefined／null／空字串／NaN 一律不輸出（AGENTS.md：缺值欄位一律省略） */
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    out[k] = v;
  }
  return out;
}

const now = new Date().toISOString();
const rows = [];
const skipped = [];

for (const p of master) {
  const best = (matchByCluster.get(p.cluster)?.matches || [])[0];
  const name = p.official_name || (p.ocr_names || "").split("|")[0].trim();
  if (!name) {
    skipped.push({ cluster: p.cluster, reason: "沒有可用的商品名稱（官方無對應且 OCR 無文字）" });
    continue;
  }

  const inStock = best?.in_stock === "inStock";
  // 官方未評分時會回 0；寫 0 會看起來像真的 0 星，故省略
  const rating = typeof best?.rating === "number" && best.rating > 0 ? best.rating : undefined;
  const reviews = typeof best?.reviews === "number" && best.reviews > 0 ? best.reviews : undefined;

  // 只在有官方對應時給 id 前綴 jp-（與 2.0 既有資料一致）；否則用 onsite- 標示來源不同
  const id = p.official_code ? `jp-${p.official_code}` : `onsite-${p.cluster}`;

  const note = [
    `來源：日本 Costco 現場照片 ${p.photos_n} 張`,
    best ? `官方比對 ${p.match_confidence}（分數 ${p.match_score}）` : "無官方對應（可能店內限定）",
    best?.evidence ? `字面證據：${best.evidence}` : "",
    p.priority_reasons ? `跨境優先度 ${p.crossborder_priority}：${p.priority_reasons}` : "",
    p.regulation_flags ? `法規類別：${p.regulation_flags}` : "",
    "現場價牌未經人工 VERIFIED，未寫入特價欄位"
  ].filter(Boolean).join("｜");

  const row = compact({
    id,
    jp_name: name,
    english_name: p.official_english_name || undefined,
    zh_name: p.product_name_zh || undefined,
    costco_url: p.official_url || undefined,
    image_url: p.official_image || undefined,
    jp_price: typeof p.official_price_jpy === "number" ? p.official_price_jpy : undefined,
    price_confirmed_at: typeof p.official_price_jpy === "number" ? now : undefined,
    in_stock: inStock,
    rating,
    review_count: reviews,
    evidence_source: p.official_url || "onsite_photo_ocr",
    evidence_type: p.official_code ? "official_catalog_onsite_match" : "onsite_photo_ocr",
    regulation_risk: p.regulation_flags || undefined,
    suitable_for_import: p.publish_suggestion === "可",
    procurement_note: note,
    status: "pending_review",
    score: typeof p.crossborder_priority === "number" ? p.crossborder_priority : undefined,
    search_batch_id: BATCH,
    created_at: now,
    updated_at: now
  });

  // 硬規則自我檢查
  const bad = Object.keys(row).filter((k) => !ALLOWED.has(k));
  if (bad.length) throw new Error(`產出含未知欄位：${bad.join(", ")}`);
  if (row.status !== "pending_review") throw new Error("status 必須是 pending_review");
  if ("discount_price" in row) throw new Error("不可寫入 discount_price（現場價牌未 VERIFIED）");
  if (!row.jp_name) throw new Error("jp_name 不可為空");
  for (const k of ["taiwan_suggested_price", "logistics_cost", "landed_cost"]) {
    if (k in row) throw new Error(`${k} 不應推估`);
  }
  rows.push(row);
}

// 以 id 去重（同一官方商品可能來自多個群組，前段已合併但仍防禦）
const byId = new Map();
for (const r of rows) {
  if (!byId.has(r.id)) byId.set(r.id, r);
}
const finalRows = [...byId.values()];

fs.writeFileSync(OUT, JSON.stringify(finalRows, null, 1) + "\n");

const withPrice = finalRows.filter((r) => r.jp_price).length;
const withImage = finalRows.filter((r) => r.image_url).length;
const official = finalRows.filter((r) => r.id.startsWith("jp-")).length;
const importable = finalRows.filter((r) => r.suitable_for_import).length;

console.log("═".repeat(66));
console.log("現場照片 → products 種子轉換");
console.log("═".repeat(66));
console.log(`來源：${IN}`);
console.log(`產出：${OUT}（${(fs.statSync(OUT).size / 1024).toFixed(1)} KB）`);
console.log();
console.log(`  商品筆數        : ${finalRows.length}${skipped.length ? `（略過 ${skipped.length} 筆）` : ""}`);
console.log(`  有官方項號      : ${official}`);
console.log(`  有官方價格      : ${withPrice}`);
console.log(`  有官方圖片      : ${withImage}`);
console.log(`  suitable_for_import = true : ${importable}`);
console.log(`  status          : 全部 pending_review（不直接上架）`);
console.log();
console.log("  已刻意不寫入：discount_price（特價需人工 VERIFIED）、");
console.log("               taiwan_suggested_price／logistics_cost／landed_cost（不推估）、");
console.log("               GPS、照片檔名、Drive 連結（清冊類資料只進私人 Queue）");
if (skipped.length) {
  console.log("\n  略過清單：");
  for (const s of skipped) console.log(`    群組 ${s.cluster}：${s.reason}`);
}

if (args.includes("--post")) {
  const env = Object.fromEntries(
    fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")
      .map((l) => l.match(/^([A-Za-z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")])
  );
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\n❌ 缺 SUPABASE_URL／SUPABASE_SERVICE_ROLE_KEY，無法寫入");
    process.exit(1);
  }
  console.log(`\n寫入 Supabase（${finalRows.length} 筆，upsert on id）…`);

  // 不降級已發布商品：upsert 會整列覆蓋，若把已 published 的商品寫成
  // pending_review，等於讓它從商店消失。既有 published 的列不送 status。
  let publishedIds = new Set();
  try {
    const r = await fetch(`${url}/rest/v1/products?select=id&status=eq.published`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (r.ok) publishedIds = new Set((await r.json()).map((x) => x.id));
  } catch { /* 取不到就維持原行為 */ }
  const skippedStatus = finalRows.filter((r) => publishedIds.has(r.id)).length;
  if (skippedStatus) {
    console.log(`  已發布商品 ${skippedStatus} 筆：不改動 status（避免從商店消失）`);
  }

  const payloadRows = finalRows.map((r) => {
    if (!publishedIds.has(r.id)) return r;
    const { status, ...rest } = r;
    return rest;
  });

  // PostgREST 要求同一批的每筆物件欄位必須完全相同（PGRST102）。
  // 但依 AGENTS.md「缺值欄位一律省略」，各筆欄位本來就不同；
  // 因此依「欄位組合」分組送出，不為了湊格式而補 null（補 null 會覆蓋既有值）。
  const byShape = new Map();
  for (const r of payloadRows) {
    const sig = Object.keys(r).sort().join(",");
    if (!byShape.has(sig)) byShape.set(sig, []);
    byShape.get(sig).push(r);
  }
  let ok = 0;
  for (const [sig, group] of byShape) {
    for (let i = 0; i < group.length; i += 50) {
      const chunk = group.slice(i, i + 50);
      const res = await fetch(`${url}/rest/v1/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(chunk)
      });
      if (!res.ok) {
        console.error(`❌ 欄位組合 [${sig.slice(0, 60)}…] 第 ${i / 50 + 1} 批失敗：${res.status} ${(await res.text()).slice(0, 300)}`);
        process.exit(1);
      }
      ok += chunk.length;
    }
  }
  console.log(`✅ 已寫入 ${ok} 筆（分 ${byShape.size} 種欄位組合；status=pending_review，需人工審核後才會上架）`);
}
