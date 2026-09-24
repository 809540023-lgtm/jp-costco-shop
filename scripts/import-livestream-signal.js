// Ground Truth 匯入：把直播帶貨分析（~/costco-analysis/products_part*.md，GLM 整理）
// 寫入 Product Intelligence Graph：source_listing(reseller_video) + reseller_mention +
// price_observation(daigou)。競業直播是正式 Market Signal（SPEC 一、5.2）。
// 用法：node scripts/import-livestream-signal.js <md檔...> [--reseller-key skyblue] [--platform facebook] [--source-url <url>]
// 注意：只寫 Supabase，不把清冊提交到 GitHub（同 Drive 隱私規則）。
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const args = process.argv.slice(2);
const getArg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const files = args.filter((a) => !a.startsWith("--"));
const RESELLER_KEY = getArg("--reseller-key", "skyblue");
const PLATFORM = getArg("--platform", "facebook");
const SOURCE_URL = getArg("--source-url", "");
const VIDEO_DATE = getArg("--video-date", new Date().toISOString().slice(0, 10));

if (!files.length) { console.error("用法：node scripts/import-livestream-signal.js <md檔...> [flags]"); process.exit(1); }

async function rest(method, table, query, body) {
  const res = await fetch(`${URL}/rest/v1/${table}${query || ""}`, {
    method,
    headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}`,
      ...(method === "POST" ? { Prefer: "return=representation,resolution=merge-duplicates" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`${table} ${method} 失敗: ${res.status} ${t.slice(0, 300)}`); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 解析 GLM 商品清單格式：### 商品名 → **出現時間**：[mm:ss] → **售價**：...
// 各分段單位混用（日圓／元），一律取「售價」列第一個價格（避免誤抓內文比較價）。
function parseProducts(md) {
  const out = [];
  const sections = md.split(/\n###\s+/).slice(1);
  for (const sec of sections) {
    const name = (sec.split(/\n/)[0] || "").trim();
    const timeMatch = sec.match(/\*\*出現時間\*\*：\[(\d+):(\d+)\]/);
    const priceLine = (sec.match(/^-\s*\*\*售價\*\*：(.*)$/m) || [])[1] || "";
    // 排除「商城價 N」與「平均一袋約 N」等次要數字，避免抓錯
    const priceCore = priceLine
      .replace(/商城價[^0-9]*\d[\d,]*/g, "商城價")
      .replace(/平均一[袋包盒個條入][^，。；）]*/g, "");
    let priceMatches = [...(priceCore.match(/(\d[\d,]*)\s*(?:日?圓|元)/g) || [])]
      .map((s) => Number(s.replace(/[^\d]/g, "")));
    if (!priceMatches.length) {
      const bare = priceCore.match(/(\d[\d,]*)/); // 無單位寫法（如「線上價 899」）
      if (bare) priceMatches = [Number(bare[1].replace(/[^\d]/g, ""))];
    }
    const promo = /限時|特價|優惠|下殺|限定價/.test(priceLine);
    if (name && priceMatches.length) {
      out.push({
        name: name.slice(0, 80),
        timestamp: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null,
        priceJpy: priceMatches[0],
        isPromo: promo
      });
    }
  }
  return out;
}

(async () => {
  let total = 0, entities = 0, mentions = 0, prices = 0;
  for (const file of files) {
    const md = fs.readFileSync(file, "utf8");
    const products = parseProducts(md);
    console.log(`解析 ${path.basename(file)}：${products.length} 項商品`);
    for (const p of products) {
      // product_entity：以 canonical_name+brand 唯一（直播帶貨名稱當標準名，brand 空值 → null）
      const findRes = await rest("GET", "product_entity",
        `?canonical_name=${encodeURIComponent(p.name)}&select=id`);
      let entity = findRes && findRes[0];
      if (!entity) {
        const created = await rest("POST", "product_entity", "",
          { canonical_name: p.name, keywords: [p.name], status: "candidate" });
        entity = created && created[0];
        entities += 1;
      }
      if (!entity) continue;

      // source_listing：dedup_hash 以 reseller+商品+日期去重
      const dedupHash = `livestream:${RESELLER_KEY}:${p.name}:${VIDEO_DATE}`;
      const dup = await rest("GET", "source_listing", `?dedup_hash=eq.${encodeURIComponent(dedupHash)}&select=id`);
      if (dup && dup.length) continue;
      const listing = await rest("POST", "source_listing", "", {
        product_id: entity.id,
        source_type: "reseller_video",
        external_id: dedupHash,
        url: SOURCE_URL || null,
        title: `${p.name}（直播帶貨 ${p.timestamp || ""}）`,
        author: RESELLER_KEY,
        author_key: RESELLER_KEY,
        published_at: VIDEO_DATE,
        raw_payload: { timestamp: p.timestamp, file: path.basename(file) },
        dedup_hash: dedupHash
      });

      // 首次提及判定
      const prior = await rest("GET", "reseller_mention",
        `?product_id=eq.${entity.id}&reseller_key=eq.${encodeURIComponent(RESELLER_KEY)}&select=id`);
      await rest("POST", "reseller_mention", "", {
        product_id: entity.id,
        source_listing_id: listing && listing[0] ? listing[0].id : null,
        reseller_key: RESELLER_KEY,
        platform: PLATFORM,
        is_first_mention: !prior || prior.length === 0,
        mentioned_at: VIDEO_DATE
      });
      mentions += 1;

      // price_observation：直播售價＝代購行情（JPY）
      await rest("POST", "price_observation", "", {
        product_id: entity.id,
        market: "daigou",
        price: p.priceJpy,
        currency: "JPY",
        is_promo: p.isPromo,
        observed_at: VIDEO_DATE,
        source_url: SOURCE_URL || null
      });
      prices += 1;
      total += 1;
    }
  }
  console.log(`完成：商品 ${total} 筆（新實體 ${entities}、mentions ${mentions}、價格觀測 ${prices}）`);
})().catch((e) => { console.error(e.message); process.exit(1); });