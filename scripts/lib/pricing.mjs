// 已發布但缺台幣定價的商品 → 人工核定售價（scripts/price-missing.mjs 的純邏輯，可單測）。
//
// 為什麼需要這支：現場照片匯入的商品（`official_catalog_onsite_match`）依規則
// 「不推估價格」（scripts/seed-onsite-products.mjs），所以沒有 taiwan_suggested_price，
// 前端只能顯示「未定價」。售價不可由程式自動寫入（AGENTS.md），
// 因此這裡只產生**參考價**供人工核對，實際寫入一定要經過 `--apply <CSV>`。
import { JPY_TWD, toTwd } from "./exclude-rules.mjs";

/** 參考價說明（顯示在清單，避免被當成正式售價）。 */
export const REFERENCE_NOTE = `日幣現行價 × ${JPY_TWD}（未含國際運費與關稅，僅供參考）`;

/**
 * 現行日幣價。`jp_price` 是官方現行價，`discount_price` 才是促銷前原價
 * （lib/search.ts：`["discount_price", raw.promoEvidence ? raw.regularPrice : undefined]`）。
 */
export function currentJpy(product) {
  const v = Number(product?.jp_price);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** 促銷前原價（僅在官方有促銷證據時才有值）。 */
export function regularJpy(product) {
  const v = Number(product?.discount_price);
  return Number.isFinite(v) && v > 0 && v !== currentJpy(product) ? v : null;
}

/** 沒有台幣定價（缺值、0 或非數字）→ 需要人工定價。 */
export function needsPricing(product) {
  const tw = Number(product?.taiwan_suggested_price);
  return !(Number.isFinite(tw) && tw > 0);
}

/** 參考台幣價；沒有日幣價時回 null（不可憑空產生）。 */
export function referenceTwdFor(product) {
  const jpy = currentJpy(product);
  return jpy == null ? null : toTwd(jpy);
}

/** 使用者填的售價字串 → 整數台幣；不合法回 null（`1,234` 可接受）。 */
export function parseTwd(input) {
  if (input == null) return null;
  const s = String(input).replace(/[,\s]/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : null;
}

/** 解析 CSV（單列逗號分隔、支援引號），回傳 [{ id, twd_price }]。 */
export function parsePriceCsv(text) {
  const lines = String(text || "").replace(/^\ufeff/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { header: [], rows: [], error: "CSV 是空的" };

  const split = (line) => {
    const cells = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
      } else if (ch === "," && !inQ) { cells.push(cur); cur = ""; } else cur += ch;
    }
    cells.push(cur);
    return cells;
  };

  const header = split(lines[0]).map((s) => s.trim());
  const iId = header.indexOf("id");
  const iPrice = header.indexOf("twd_price");
  if (iId < 0 || iPrice < 0) return { header, rows: [], error: "CSV 需含 id 與 twd_price 欄位" };

  const rows = lines.slice(1).map((l) => {
    const cells = split(l);
    return { id: (cells[iId] || "").trim(), twd_price: (cells[iPrice] || "").trim() };
  });
  return { header, rows, error: null };
}

/**
 * 規劃要寫入的售價。
 * 只有「已發布」的商品可寫，且已定價者需 `--force` 才覆寫，避免誤蓋人工定價。
 */
export function planPriceUpdates(publishedProducts, rows, { force = false } = {}) {
  const byId = new Map((publishedProducts || []).map((p) => [p.id, p]));
  const updates = [];
  const skipped = [];

  for (const row of rows || []) {
    const id = (row?.id || "").trim();
    if (!id) { skipped.push({ id: "", reason: "missing_id" }); continue; }
    const product = byId.get(id);
    if (!product) { skipped.push({ id, reason: "not_published" }); continue; }
    const price = parseTwd(row.twd_price);
    if (price == null) { skipped.push({ id, reason: "invalid_price" }); continue; }
    if (!needsPricing(product) && !force) { skipped.push({ id, reason: "already_priced" }); continue; }
    updates.push({ id, price, from: product.taiwan_suggested_price ?? null });
  }
  return { updates, skipped };
}
