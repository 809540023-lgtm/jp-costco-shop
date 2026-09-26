// 代購排除規則與匯率換算（共用模組）。
//
// 為什麼獨立成模組：同一組規則要同時套用在「待審商品」（review-pending）與
// 「已上架商品」的稽核上，避免兩邊規則漂移。
//
// 與 lib/search.ts 的 estimate()／lib/ranking.ts 的 shouldExclude 的關係：
// 搜尋端已有 shouldExclude，但關鍵字只寫英文／少數漢字，日文名稱（ビール、天然水）
// 會漏抓。這裡補上日文寫法，並沿用專案文件列的不優先項
// （紙品／瓶裝水／整箱飲料／尿布／大型物／臺灣也買得到的全球品牌）。
//
// 每條規則可帶第三項「例外樣式」：命中主樣式但同時命中例外者不算排除。
// 這是以實際資料驗證後補上的——不做例外處理會誤刪真正在賣的商品，實測誤判例如：
//   日本酒の化粧水／美容液（日本酒成分的保養品，不是酒）
//   HARIO ウォータードリッパー（咖啡濾杯）、水99% 手口ふき（濕紙巾）
//   UCC アイスコーヒー（ice 誤中）、ファブリーズ カーフレッシュナー（fresh 誤中）

export const EXCLUDE_RULES = [
  ["酒類（不可跨境寄送）",
    /ビール|ワイン|日本酒|焼酎|ウイスキー|チューハイ|ハイボール|梅酒|泡盛|リキュール|カクテル|スパークリングワイン|スーパードライ|一番搾り|サッポロ|ヱビス|プレモル|モルツ|発泡酒|本麒麟|淡麗|金麦|のどごし|\b(beer|wine|whisky|liquor|spirits)\b/i,
    /化粧水|美容液|クリーム|マスク|ジェル|洗顔|ローション|石鹸|ハンドクリーム|オイル|スキンケア/i],
  ["水類（重量大・單價低）",
    /天然水|ミネラルウォーター|炭酸水|ウォーター|ラベルレス|\bmineral water\b/i,
    /ドリッパー|フィルター|サーバー|ポット|加湿|ふき|ウェット|タオル|ミネラル(?!ウォーター)/i],
  ["紙品・尿布（體積大單價低）",
    /トイレットペーパー|ペーパータオル|ティッシュ|キッチンペーパー|おしりふき|おしりナップ|おむつ|オムツ|メリーズ|ムーニー|パンパース|グーン|エリエール|\b(tissue|paper ?towel|diaper)n?s?\b/i],
  ["生鮮・冷凍（不可常溫寄送）",
    /冷凍|冷蔵|チルド|生鮮|アイスクリーム|ジェラート|ヨーグルト|牛乳|\b(frozen|chilled|refrigerated)\b/i],
  ["全球共通品牌（臺灣也買得到）",
    /kirkland|カークランド|apple|iphone|ipad|macbook|airpods|airtag|sony|ソニー|panasonic|パナソニック|dyson|ダイソン|samsung|サムスン|nintendo|ニンテンドー|オキシクリーン|oxi ?clean|duracell|デュラセル|\benergizer\b/i],
  ["大型・重量物（運費不划算）",
    /テレビ|冷蔵庫|洗濯機|エアコン|マットレス|ソファ|ベッド|自転車|タイヤ|家具|物置|カーポート|\b(television|refrigerator|washing machine|mattress|sofa|bicycle|tire)\b/i],
];

/**
 * 判斷商品是否應排除。
 * @returns {{ excluded: boolean, reasons: string[] }}
 */
export function classifyExclude(product) {
  const hay = `${product.jp_name || product.jpName || ""} ${product.english_name || product.englishName || ""}`;
  const reasons = EXCLUDE_RULES
    .filter(([, re, unless]) => re.test(hay) && !(unless && unless.test(hay)))
    .map(([name]) => name);
  return { excluded: reasons.length > 0, reasons };
}

/** 日幣 → 臺幣匯率。沿用 lib/graph/pipeline.ts 與 listing-draft.ts 的 JPY_TWD_RATE（預設 0.22）。 */
export const JPY_TWD = Number(process.env.JPY_TWD_RATE || "0.22");

/** 日幣換算為臺幣（整數）；無價格時回 null */
export function toTwd(jpy) {
  return jpy == null || jpy === "" ? null : Math.round(Number(jpy) * JPY_TWD);
}
