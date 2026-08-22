// 其他通路價格比較模組。
// 依商品日文名搜尋日本購物網站（Yahoo Shopping、Amazon JP），擷取最低/首筆價格供用戶比較。
// 屬「best-effort」：來源被擋或無法解析時會略過，不影響主流程。

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function parseYahoo(html) {
  // Yahoo Shopping 使用 __NEXT_DATA__ JSON
  const start = html.indexOf('id="__NEXT_DATA__"');
  if (start < 0) return [];
  const s = html.indexOf(">", start) + 1;
  const end = html.indexOf("</script>", s);
  if (end < 0) return [];
  let data;
  try { data = JSON.parse(html.slice(s, end)); } catch { return []; }
  const out = [];
  (function walk(o) {
    if (!o) return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (typeof o !== "object") return;
    if (typeof o.price === "number" && typeof o.name === "string" && o.name.length > 2) {
      out.push({ source: "Yahoo 購物", name: o.name, price: o.price, currency: "JPY" });
    }
    Object.values(o).forEach(walk);
  })(data);
  return out;
}

function parseAmazon(html) {
  // Amazon JP 搜尋結果的價格元素
  const out = [];
  const re = /<span class="a-offscreen">([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    const curMatch = raw.match(/([A-Z]{3})\s*([\d,]+(?:\.\d+)?)/);
    if (curMatch) {
      out.push({ source: "Amazon JP", name: "", price: parseFloat(curMatch[2].replace(/,/g, "")), currency: curMatch[1] });
    }
  }
  return out;
}

// 依商品名抓取其他通路價格，回傳 [{ source, name, price, currency }]
async function fetchComparisonPrices(productName) {
  const q = encodeURIComponent(productName);
  const results = [];

  // Yahoo Shopping
  try {
    const yRes = await fetch(`https://shopping.yahoo.co.jp/search?p=${q}`, {
      headers: { "User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9" },
      signal: AbortSignal.timeout(20000)
    });
    if (yRes.ok) {
      const html = await yRes.text();
      const yp = parseYahoo(html);
      if (yp.length) {
        yp.sort((a, b) => a.price - b.price);
        results.push(yp[0]);
      }
    }
  } catch (e) { /* 略過 */ }

  // Amazon JP（幣別依伺服器 IP 判斷，可能為 TWD）
  try {
    const aRes = await fetch(`https://www.amazon.co.jp/s?k=${q}`, {
      headers: { "User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9" },
      signal: AbortSignal.timeout(20000)
    });
    if (aRes.ok) {
      const html = await aRes.text();
      const ap = parseAmazon(html);
      if (ap.length) results.push(ap[0]);
    }
  } catch (e) { /* 略過 */ }

  return results;
}

module.exports = { fetchComparisonPrices };
