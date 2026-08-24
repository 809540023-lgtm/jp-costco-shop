// 升級已發布商品：改用高解析度圖片 + 換算台幣售價。
// - 圖片：從官方 FULL 詳情取 zoom(1200) 或 product(740) 變體，取代 160x160 縮圖。
// - 價格：依匯率把 jp_price(JPY) 換算成 taiwan_suggested_price(NT$)。
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = path.join(__dirname, "..");
const dbPath = process.env.DB_PATH || path.join(root, "data", "jp-costco.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";
// 1 JPY = 0.20034 TWD（2026-08-24 匯率）
const JPY_TO_TWD = 0.20034;

async function fetchDetail(code) {
  const url = `https://www.costco.co.jp/rest/v2/japan/products/${code}?fields=FULL`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  return res.json();
}

function pickImage(d) {
  const imgs = d.images || [];
  const abs = (u) => (u.startsWith("http") ? u : `https://www.costco.co.jp${u.startsWith("/") ? "" : "/"}${u}`);
  // 優先 zoom，其次 product
  for (const fmt of ["zoom", "product"]) {
    const hit = imgs.find((i) => i.format === fmt && i.url);
    if (hit) return abs(hit.url);
  }
  return null;
}

async function main() {
  const products = db.prepare("SELECT id, jp_name, jp_price, image_url FROM products WHERE status='published'").all();
  let imgFixed = 0, priceFixed = 0, failed = 0;
  for (const p of products) {
    try {
      const d = await fetchDetail(p.id.replace("jp-", ""));
      if (!d) { failed++; continue; }
      const newImg = pickImage(d);
      if (newImg) {
        db.prepare("UPDATE products SET image_url=? WHERE id=?").run(newImg, p.id);
        imgFixed++;
      }
      if (p.jp_price) {
        const twd = Math.round(p.jp_price * JPY_TO_TWD);
        db.prepare("UPDATE products SET taiwan_suggested_price=? WHERE id=?").run(twd, p.id);
        priceFixed++;
      }
    } catch (e) { failed++; }
  }
  console.log(`完成：更新圖片 ${imgFixed} 項、台幣售價 ${priceFixed} 項、失敗 ${failed} 項。`);
  db.close();
}

main().catch((e) => { console.error("失敗:", e.message); process.exit(1); });
