// 抓取日本 Costco 前 50 名最熱門商品（依官方 sellCount 排序）。
// 排除：臺灣也有販售的自有品牌（Kirkland / カークランド）、體積較大的冷藏/冷凍類商品。
// 資料來源：Costco Japan 官方 REST API（/rest/v2/japan/products/search）。
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = path.join(__dirname, "..");
const dbPath = process.env.DB_PATH || path.join(root, "data", "jp-costco.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

const n = db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='products'").get().n;
if (n === 0) db.exec(fs.readFileSync(path.join(root, "lib", "schema.sql"), "utf8"));

const API = "https://www.costco.co.jp/rest/v2/japan/products/search";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const TARGET = 50; // 目標保留 50 項
const MAX_PAGES = 30;

// 排除：自有品牌（Kirkland，臺灣也有販售）
function isKirkland(name) {
  return /カークランド/.test(name);
}

// 排除：體積較大的冷藏/冷凍類商品
function isFrozenOrBulky(name) {
  const t = name.toLowerCase();
  // 冷藏/冷凍/生鮮
  if (/冷凍|冷蔵|チルド|アイスクリーム|ジェラート|冷食|生鮮|ヨーグルト|豆腐|納豆|肉$|肉類|牛肉|豚肉|鶏肉|ハム|ベーコン|ソーセージ|魚|エビ|カニ|シーフード|バター|チーズ|牛乳|飲むヨーグルト|プチパン|プルコギ|冷凍パン|冷凍食品|クロワッサン|フローズン/.test(t)) return true;
  // 體積大、價值低
  if (/トイレットペーパー|ペーパータオル|ティッシュ|ミネラルウォーター|天然水|炭酸水|ペットボトル|コーン|おむつ|オムツ/.test(t)) return true;
  return false;
}

// 排除：不適合跨境販售的高法規/不可寄送商品
function isUnshippable(name) {
  const t = name.toLowerCase();
  // 醫療器材（隱形眼鏡等）
  if (/コンタクト|アキュビュー|エア ?オプティクス|オプティクス|デイリーズ|フレッシュルック|ワンデー|オアシス|ディファイン|モイスト|マルチフォーカル|乱視用|遠近両用|ベースカーブ/.test(t)) return true;
  // 數位禮物卡（非實體商品）
  if (/ギフトカード|デジタルギフト|プリペイド/.test(t)) return true;
  // 酒精飲料（高法規風險）
  if (/ビール|ワイン|日本酒|焼酎|酎ハイ|ラガー|コロナ|エクストラ|缶チューハイ|酒$|ウイスキー|ジン|ウォッカ/.test(t)) return true;
  // 健康食品/保健食品（高法規風險）
  if (/青汁|プロテイン|サプリメント|健康食品|ビタミン|酵素/.test(t)) return true;
  return false;
}

async function fetchPage(page, size = 100) {
  const url = `${API}?query=:sellCount-desc&currentPage=${page}&pageSize=${size}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function collectTop() {
  const kept = [];
  let page = 0;
  let skipped = 0;
  while (kept.length < TARGET && page < MAX_PAGES) {
    const d = await fetchPage(page);
    const prods = d.products || [];
    if (!prods.length) break;
    for (const p of prods) {
      const name = p.name || "";
      if (isKirkland(name)) { skipped++; continue; }
      if (isFrozenOrBulky(name)) { skipped++; continue; }
      if (isUnshippable(name)) { skipped++; continue; }
      kept.push({
        id: `jp-${p.code}`,
        jpName: name,
        englishName: p.englishName || null,
        price: p.price ? p.price.value : null,
        priceFormatted: p.price ? p.price.formattedValue : null,
        rating: p.averageRating || null,
        reviewCount: p.numberOfReviews || 0,
        url: p.url ? new URL(p.url, "https://www.costco.co.jp/").toString() : null,
        imageUrl: p.images && p.images[0] ? p.images[0].url : null
      });
      if (kept.length >= TARGET) break;
    }
    page++;
  }
  return { kept, skipped, pages: page };
}

function writeToDb(kept) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const batchId = `sb-${date}-${now.toISOString().slice(11, 19).replace(/:/g, "")}`;
  db.prepare("INSERT INTO search_batches (id, search_date, status, product_count) VALUES (?,?,?,?)")
    .run(batchId, date, kept.length);

  for (const p of kept) {
    db.prepare(
      `INSERT INTO products (id, jp_name, brand, category, costco_url, image_url, jp_price, rating, review_count,
        evidence_source, evidence_type, status, score, search_batch_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending_review',?,?)
       ON CONFLICT(id) DO UPDATE SET
         jp_name=excluded.jp_name, costco_url=excluded.costco_url, image_url=excluded.image_url,
         jp_price=excluded.jp_price, rating=excluded.rating, review_count=excluded.review_count,
         evidence_source=excluded.evidence_source, evidence_type=excluded.evidence_type,
         score=excluded.score, search_batch_id=excluded.search_batch_id, updated_at=datetime('now')`
    ).run(
      p.id, p.jpName, null, null, p.url, p.imageUrl, p.price, p.rating, p.reviewCount,
      "https://www.costco.co.jp/", "official_sell_count", 50, batchId
    );
    db.prepare("INSERT INTO product_rankings (product_id, search_batch_id, score, score_breakdown) VALUES (?,?,?,?)")
      .run(p.id, batchId, 50, JSON.stringify({ source: "official_sell_count", rank: p.rank }));
  }
  db.prepare("UPDATE search_batches SET status='completed', summary=? WHERE id=?").run(
    `依官方 sellCount 排序保留前 ${kept.length} 項熱門商品（已排除 Kirkland 與冷藏/冷凍/體積大商品）。`, batchId
  );
  return batchId;
}

async function main() {
  const { kept, skipped, pages } = await collectTop();
  kept.forEach((p, i) => (p.rank = i + 1));
  const batchId = writeToDb(kept);
  console.log(`搜尋批次: ${batchId}`);
  console.log(`已抓取 ${pages} 頁，排除 ${skipped} 項（Kirkland/冷藏冷凍/體積大），保留 ${kept.length} 項。`);
  console.log("\n=== 前 50 名熱門商品 ===");
  kept.forEach((p, i) => {
    console.log(`${String(i + 1).padStart(2)}. [${p.reviewCount} 評論] ${p.jpName} ${p.priceFormatted ? "(" + p.priceFormatted + ")" : ""}`);
  });
  db.close();
}

main().catch((e) => { console.error("抓取失敗:", e.message); process.exit(1); });
