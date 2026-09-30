// 2.0 `products` ↔ 3.0 `product_entity` 的狀態對應與修復規劃。
//
// 為什麼需要這支：`bootstrap-entities.js` 建立實體後只會「跳過已存在」，
// 不會回頭修正狀態。2026-09-27 就發生過部署端 cron 用舊程式碼把 56 筆
// 人工已上架的實體一次打成 `rejected`，之後只能手動改資料庫。
//
// 規則（AGENTS.md）：人工已上架的商品是商業事實 → `listed`，
// 只有法規硬性淘汰（`hardFail`）能覆寫，單次低分不行。

/** 實體去重鍵（與 product_entity 的 unique 條件、import-livestream-signal.js 一致）。 */
export function entityKey(name, brand) {
  return `${(name || "").trim()}|${(brand || "").trim()}`;
}

/** 實體標準名：繁中譯名 > 英文名 > 日文名（與前台顯示的優先序一致）。 */
export function canonicalName(p) {
  return (p.zh_name || p.english_name || p.jp_name || "").trim();
}

/** 商品在 Graph 裡應有的實體狀態。 */
export function expectedEntityStatus(product) {
  return product?.status === "published" ? "listed" : "candidate";
}

/**
 * 規劃狀態修復：找出「對應到已發布商品、卻不是 listed」的實體。
 *
 * 只做單向修復（→ `listed`），不把 listed 降級：`listed` 也可能是競業清冊
 * 匯入時人工指定的事實，不該由這支腳本自動取消。
 */
export function planStatusRepairs(products, entities) {
  const wantListed = new Map();
  for (const p of products || []) {
    if (expectedEntityStatus(p) !== "listed") continue;
    const name = canonicalName(p);
    if (!name) continue;
    wantListed.set(entityKey(name, p.brand), name);
  }

  const repairs = [];
  for (const e of entities || []) {
    if (!e || e.id == null) continue;
    if (e.status === "listed") continue;
    const key = entityKey(e.canonical_name, e.brand);
    if (!wantListed.has(key)) continue;
    repairs.push({
      id: e.id,
      canonical_name: e.canonical_name,
      brand: e.brand || null,
      from: e.status ?? null,
      to: "listed"
    });
  }
  return repairs;
}
