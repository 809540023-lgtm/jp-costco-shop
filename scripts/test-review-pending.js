// 用 jsdom 實際渲染待審商品核對頁，驗證渲染／篩選／臺幣／排除劃掉／匯出決定 CSV。
// 受測對象是「產生出來的 HTML」；需要驗證特定狀態時，把內嵌資料換成合成資料，
// 讓斷言不隨真實資料筆數變動而失效。
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const FILE = path.join(__dirname, "..", "review", "pending_review.html");
if (!fs.existsSync(FILE)) {
  console.error(`找不到 ${FILE}，請先執行：node scripts/review-pending.mjs`);
  process.exit(1);
}
const rawHtml = fs.readFileSync(FILE, "utf8");

function render(html) {
  let csv = null;
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/" });
  const { window } = dom;
  window.URL.createObjectURL = () => "blob:x";
  window.URL.revokeObjectURL = () => {};
  window.Blob = class { constructor(parts) { csv = parts.join(""); } };
  const orig = window.document.createElement.bind(window.document);
  window.document.createElement = (t) => { const el = orig(t); if (t === "a") el.click = function () {}; return el; };
  return { d: window.document, getCsv: () => csv };
}

const fail = [];
const ok = (c, m) => { console.log((c ? "PASS" : "FAIL") + "  " + m); if (!c) fail.push(m); };

// ── 1) 真實資料：結構與筆數一致性 ───────────────────────────────────────
{
  const { d } = render(rawHtml);
  const data = JSON.parse(d.getElementById("data").textContent);
  ok(data.length > 0, `內嵌資料 ${data.length} 筆`);
  ok(d.querySelectorAll(".card").length === data.length,
    `渲染卡片數與資料一致（${d.querySelectorAll(".card").length} / ${data.length}）`);
  ok(d.getElementById("st").textContent.includes(`/ ${data.length}`),
    `進度文字：${d.getElementById("st").textContent}`);

  d.getElementById("fAll").onclick();
  ok(d.querySelectorAll(".card").length === data.length, "「全部」顯示全量");

  d.getElementById("fHigh").onclick();
  const highShown = d.querySelectorAll(".card").length;
  const highExpected = data.filter((x) => x.risk === "high").length;
  ok(highShown <= highExpected, `「高法規風險」篩選筆數(${highShown}) ≤ 資料中高風險數(${highExpected})`);

  d.getElementById("fLow").onclick();
  ok(d.querySelectorAll(".card").length > 0, "「低分」篩選有結果");
  d.getElementById("fAll").onclick();
}

// ── 2) 合成資料：臺幣顯示、排除劃掉、CSV 欄位 ───────────────────────────
{
  const synthetic = [
    { id: "jp-9001", jp_name: "テスト商品A", english_name: "TEST A", jp_price: 13980, discount_price: null,
      score: 72, evidence_type: "official_rest_api", image_url: null, costco_url: null, rating: null,
      review_count: null, flags: ["食品"], risk: "medium", excluded: false, exclude_reasons: [], twd: 3076 },
    { id: "jp-9002", jp_name: "サッポロ 生ビール 350ml", english_name: "BEER 350ML", jp_price: 5280,
      discount_price: null, score: 71, evidence_type: "official_rest_api", image_url: null, costco_url: null,
      rating: null, review_count: null, flags: [], risk: "low", excluded: true,
      exclude_reasons: ["酒類（不可跨境寄送）"], twd: 1162 },
  ];
  const html = rawHtml.replace(/(<script id="data" type="application\/json">)[\s\S]*?(<\/script>)/,
    `$1${JSON.stringify(synthetic)}$2`);
  const { d, getCsv } = render(html);
  // 被排除的項目預設為「不採用」，因此預設的「未決定」篩選只看得到 1 張；切到全部
  ok(d.querySelectorAll(".card").length === 1, "預設「未決定」篩選只顯示未決定的 1 張（排除項已預設不採用）");
  d.getElementById("fAll").onclick();
  ok(d.querySelectorAll(".card").length === 2, "切到「全部」後顯示 2 張卡片");

  const cards = [...d.querySelectorAll(".card")];
  ok(/約 NT\$3,076/.test(cards[0].textContent), "日幣旁顯示換算臺幣（¥13,980 → 約 NT$3,076）");
  ok(cards[1].className.includes("excl"), "被排除的商品加上 excl 樣式（劃掉）");
  ok(/建議排除：酒類/.test(cards[1].textContent), "顯示排除原因");
  ok(cards[1].querySelector('button[data-v="reject"]').getAttribute("aria-pressed") === "true",
    "排除項預設已標為「不採用」");
  ok(cards[1].querySelector('button[data-v="approve"]').getAttribute("aria-pressed") === "false",
    "仍可手動改回上架");

  // 手動改回上架後，卡片不再是 no
  cards[1].querySelector('button[data-v="approve"]').onclick();
  ok(!cards[1].className.includes(" no"), "手動改成上架後樣式更新");

  d.getElementById("exp").onclick();
  const lines = getCsv().split("\r\n");
  ok(lines[0].replace("\ufeff", "").includes("twd_price"),
    `CSV 含 twd_price 欄：${lines[0].replace("\ufeff", "").slice(0, 48)}…`);
  ok(lines.length - 1 === 2, `CSV 2 列（實際 ${lines.length - 1}）`);
  ok(lines[1].includes('"3076"'), "CSV 寫入換算後的臺幣價");
  // 匯出依原始順序：第 1 列是未決定的 jp-9001，第 2 列才是剛改回上架的 jp-9002
  ok(lines[2].includes('"approve"'), "CSV 寫入改回上架的決定");
}

console.log("\n" + (fail.length ? "FAILED: " + fail.length : "ALL PASSED"));
process.exit(fail.length ? 1 : 0);
