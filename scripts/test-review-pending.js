// 用 jsdom 實際渲染待審商品核對頁，驗證渲染／篩選／匯出決定 CSV
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('/tmp/rt/node_modules/jsdom')); }
catch { ({ JSDOM } = require('jsdom')); }

const FILE = path.join(__dirname, '..', 'review', 'pending_review.html');
const html = fs.readFileSync(FILE, 'utf8');

let csvOut = null;
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
window.URL.createObjectURL = () => 'blob:x';
window.URL.revokeObjectURL = () => {};
window.Blob = class { constructor(parts) { csvOut = parts.join(''); } };
const origCreate = window.document.createElement.bind(window.document);
window.document.createElement = (t) => {
  const el = origCreate(t);
  if (t === 'a') el.click = function () {};
  return el;
};

const d = window.document;
const fail = [];
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail.push(m); };

const cards = d.querySelectorAll('.card');
ok(cards.length === 273, `渲染 273 張卡片（實際 ${cards.length}）`);
ok(d.getElementById('st').textContent.includes('/ 273'), `進度文字：${d.getElementById('st').textContent}`);
ok(d.querySelectorAll('.imgwrap img').length > 200, `商品圖片 ${d.querySelectorAll('.imgwrap img').length} 張`);

// 篩選：高法規風險
d.getElementById('fHigh').onclick();
ok(d.querySelectorAll('.card').length === 47, `高法規風險篩選 → 47 張（實際 ${d.querySelectorAll('.card').length}）`);
// 無價格
d.getElementById('fNoPrice').onclick();
ok(d.querySelectorAll('.card').length === 9, `無價格篩選 → 9 張（實際 ${d.querySelectorAll('.card').length}）`);
d.getElementById('fAll').onclick();
ok(d.querySelectorAll('.card').length === 273, '全部篩選 → 273 張');

// 決定：第一張按「上架」，第二張按「不採用」
const c0 = d.querySelectorAll('.card')[0], c1 = d.querySelectorAll('.card')[1];
c0.querySelector('.row button[data-v="approve"]').onclick();
ok(c0.className.includes('yes'), '第一張標記為上架（卡片變色）');
c1.querySelector('.row button[data-v="reject"]').onclick();
ok(c1.className.includes('no'), '第二張標記為不採用');
ok(d.getElementById('st').textContent.startsWith('2 /'), `進度更新：${d.getElementById('st').textContent}`);

// 匯出
d.getElementById('exp').onclick();
ok(!!csvOut, '匯出決定 CSV 觸發');
const lines = csvOut.split('\r\n');
ok(lines[0].replace('\ufeff', '').startsWith('id,decision,jp_name'), `CSV 標頭：${lines[0].replace('\ufeff','').slice(0,40)}…`);
ok(lines.length - 1 === 273, `CSV 273 列（實際 ${lines.length - 1}）`);
const withApprove = lines.filter((l) => l.includes('"approve"')).length;
const withReject = lines.filter((l) => l.includes('"reject"')).length;
ok(withApprove === 1 && withReject === 1, `CSV 含 1 approve / 1 reject（實際 ${withApprove}/${withReject}）`);

console.log('\n' + (fail.length ? 'FAILED: ' + fail.length : 'ALL PASSED'));
process.exit(fail.length ? 1 : 0);
