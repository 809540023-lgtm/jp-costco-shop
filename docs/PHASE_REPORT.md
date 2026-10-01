# 各階段實作報告

依規格書分階段建立。此報告記錄每個階段的完成內容、測試結果與待辦事項。

## Phase 1：檢查現有專案 ✅
- 專案為全新空專案，只有規格書 `.docx`。
- 無既有程式、資料庫、路由、環境變數。
- 建立技術架構：Next.js + TypeScript + Tailwind + SQLite(node:sqlite) + Zod。

## Phase 2：建立商品資料模型 ✅
- `lib/schema.sql`：products、product_sources、search_batches、product_rankings、published_collections、published_collection_items、orders、order_items、customer_profiles、customs_profiles、notifications、audit_logs。
- `lib/db.ts`：node:sqlite 連線，自動建立 schema。
- `scripts/init-db.js`、`scripts/seed.js`（含 3 筆測試商品）。

## Phase 3：建立手機版商品頁 ✅
- `/costco`（商品總覽）
- `/costco/product/[id]`（單一商品頁 + 加入購物車）
- `/costco/cart`（購物車，localStorage）
- 手機優先、RWD、Tailwind。

## Phase 4：建立結帳與報關資料表單 ✅
- `/costco/checkout`：收貨 + 報關表單。
- Zod 驗證：身分證格式（A 開頭 9 碼）、手機格式、地址、個資同意。
- 敏感資料不寫入 log，後台遮罩顯示。
- `/api/checkout`：建立訂單。

## Phase 5：建立訂單系統 ✅
- `lib/orders.ts`：createOrder、getOrder、updateOrderStatus、listOrders。
- 訂單明細保存下單當時名稱與價格。
- `/costco/success` 顯示訂單編號。

## Phase 6：建立後台 ✅
- `/admin`：總覽。
- `/admin/products`：審核待審核商品、發布本期商品。
- `/admin/orders`：訂單管理、狀態更新、身分證遮罩、CSV 匯出（`/api/export`）。
- `/admin/batches`：搜尋批次。

## Phase 7：建立每日搜尋工作 ✅（結構）
- `scripts/run-search.js`：搜尋 → 整理 → 分數 → 寫入待審核 → 摘要。
- 排名邏輯 `lib/ranking.ts`（0-100 分，保留分項來源）。
- 實際抓取 Costco Japan 需搭配 DOM 解析（官方未提供公開 JSON API），已在 script 中註記。
- 排程需部署後設定（每日 08:00）。

## Phase 8：通知與部署 ⚠️（已部署，尚待設定）
- `lib/line.ts`：LINE 第一階段（網站網址）就緒；第二階段（Messaging API）需設定環境變數。
- 已部署到 **Render**：https://jp-costco-shop.onrender.com（GitHub：https://github.com/809540023-lgtm/jp-costco-shop）。
- **重要限制**：Render 免費層檔案系統是暫存的，SQLite 資料在每次重啟後會清空。正式上線需改用**持久化資料庫（Supabase PostgreSQL）** 或掛載 Render 磁碟，並加入測試/正式資料。
- cron、備份、錯誤監控尚未設定。

## 測試
- `npx vitest run`：12 通過（ranking 5、validation 7）。
- `npm run build`：通過。
- 已手動測試結帳 API（HTTP 201）與 CSV 匯出（身分證遮罩正常）。

## 待辦事項
1. 部署正式環境（Render）。
2. 設定每日 cron（08:00）。
3. 設定 LINE 第二階段（token、admin ID）。
4. 實作實際 Costco Japan 抓取（反爬解析）。
5. 加入正式後台登入與權限控管。

## 更新記錄（2026-08-22 後續補強）
- **後台登入與權限控管 ✅**：新增 `ADMIN_PASSWORD` 登入、HMAC 簽章 cookie（`lib/auth.ts`）、`/admin/login`、登出。`/admin/*` 與 `/api/export` 未登入會導向或回 401。
- **修正 Server Action + redirect 的 `Connection closed` 錯誤**：此 Next.js 版本在 `next start` 下，Server Action 呼叫 `redirect()` 會失敗。已將管理操作改為 **Route Handler（`/api/admin/login|logout|products/approve|products/publish|orders/status`）+ 客戶端元件**，並用 curl 與真實 cookie 驗證全部流程。
- **每日 cron 端點 ✅**：`/api/cron/run-search`（需 `CRON_SECRET`），`render.yaml` 加入 Cron Job（每日 08:00 Asia/Taipei），失敗會回 500 並保留上一期已發布商品。
- **搜尋批次 id 修正**：改為 `sb-YYYY-MM-DD-HHMMSS`，避免同日多次執行時 `UNIQUE` 衝突。
- **Costco 抓取模組 ✅（實際抓取）**：`lib/costco-fetch.ts` 已能從官方首頁與「新商品」頁實際解析商品（`/p/<id>` 網址），單次約 170–230 筆。商品名由 `/p/` 前最後一段網址推導。排除邏輯加入英文關鍵字（TV、Refrigerator、Mattress、Beer、SPF 等），已驗證不再保留大型家電/高法規商品。價格、評分、評論數尚未擷取（需逐商品頁解析，待後續）。
- **前 50 名熱門商品抓取 ✅**：`scripts/scrape-top50.js`（`npm run top50`）改用官方 REST API（`/rest/v2/japan/products/search`），依官方 `sellCount-desc` 排序抓取前 50 名，並擷取日本商品名、價格、評分、評論數、圖片。自動排除：Kirkland 自有品牌、冷藏/冷凍/體積大商品、隱形眼鏡等醫療器材、酒精飲料、數位禮物卡、保健食品。
- **商品完整文字說明 ✅**：每個商品再抓取官方 FULL 詳情（`description` 說明、`summary` 重點、`features` 規格功能），存入 products 表（新增 `english_name`/`description`/`summary`/`features` 欄位，含 idempotent migration），並在 `/costco/product/[id]` 顯示「商品說明」「商品重點」「規格與功能」。
- **其他通路價格比較 ✅**：`lib/price-compare.js` 依日文名搜尋 **Yahoo 購物**（JPY）與 **Amazon JP**（幣別依伺服器 IP），存入 `comparison_prices` 表，並在商品頁顯示「其他通路價格比較」（含日本 Costco 參考價）。
- **修正 lib/line.ts 的 Authorization header**（先前被截斷成 `******`）。
- **SQLite 並行鎖修正**：`lib/db.ts` 加入 `busy_timeout` 與 WAL 例外處理，解決 build 時「database is locked」。

### 尚未完成
- Supabase 持久化：**受阻**——組織「crewAI」有逾期帳單，Supabase 拒絕建立新專案，需先在 dashboard 結清。
- LINE 第二階段：需 `LINE_CHANNEL_ACCESS_TOKEN` 與 `LINE_ADMIN_ID`。
- Costco 商品價格/評分/評論數擷取（需逐商品頁解析）。

## Phase 14：3.0 收尾 — 資料層單軌化 ✅（2026-09-25）
移除 3.0 以前遺留的 SQLite 路徑，讓「手動執行」與「cron」共用同一條 Supabase route（`docs/3.0_AUDIT.md` 的「應修正」三項全數結案）。

**移除**
- `lib/db.ts`、`lib/schema.sql`（SQLite DDL；全專案已無人 import）
- `scripts/run-search.js`、`scrape-top50.js`、`scrape-categories.js`、`upgrade-products.js`、`seed.js`、`init-db.js`、`seed-published.js`
- `package.json` 的 `db:init`／`seed`／`seed:published`／`top50`／`categories` 指令與 `@types/better-sqlite3`
- `.gitignore` 的 SQLite 檔案規則（改為整個 `data/`）

**新增（補回被移除腳本仍有價值的能力，但改寫 Supabase）**
- `scripts/run-cron.mjs`：`npm run search:run`／`agents:run`／`publish:run`，以 `x-cron-secret` 呼叫 `/api/cron/*`；手動與 cron 走完全相同的 Supabase 路徑，可用 `--base=` 打正式環境。舊的 `run-search.js`（寫 SQLite）移除。
- `scripts/sync-comparison-prices.js`：`npm run compare:sync`，把 `lib/price-compare.js` 抓到的 Yahoo／Amazon 報價寫入 Supabase `comparison_prices`（前台 `/costco/product/[id]` 讀取的就是這張表）。預設跳過已有報價的商品，`--force` 重抓，`--id=` 指定單品。

**強化：資料層失敗不再被吞掉（`lib/search.ts`）**
supabase-js 在網路／權限失敗時是「回傳 `error` 而不丟錯」，因此 `runDailySearch` 原本會回報假的成功
（實測：Supabase 掛掉時仍回 `count: 267`，實際一筆都沒寫入）。現在每一次寫入都檢查 `error`，
失敗即丟錯（批次另標記 `failed` 以利後台辨識），`/api/cron/run-search` 會回 500 並保留上一期已發布商品。
新增 `tests/search-batch.test.ts`（3 項：批次建立失敗／商品寫入失敗／成功案例）。

**驗證**
- `npm test`：17 檔／117 測試全過。
- `npm run build`：通過（40 條路由；僅有 libheif-js 的既有第三方 warning）。
- `npm run search:run` 對本機 dev server 實測：錯誤 secret → 401；連不到伺服器 → 明確提示；官方 API 擷取 300 筆正常。
- 全庫掃描確認無任何 `node:sqlite`／`lib/db`／`lib/schema.sql` 殘留引用。

**⚠️ 診斷結果與後續（2026-09-26 追記）**
`npm run check:supabase` 當時顯示 **DNS ENOTFOUND：`ielurceqyovpsnfwtbek.supabase.co` 不存在**。
管理 API 查證：該帳號底下只剩 `fb-equipment-radar`（`ktqupvrefxejjjsacbqd`），**Costco 專案已從帳號消失**
（本機 DNS 正常、`supabase.co` 可解析，排除本機網路問題），資料層確認不可用。
後續以 `scripts/rebuild-supabase.mjs` 重建於 `ktqupvrefxejjjsacbqd`（28/28 表、私有 bucket 齊全），
`.env` 與 `render.yaml` 已同步，並實測通過：`search:run`／`agents:run` 皆 HTTP 200、前台 90 筆商品。
重建後的完整驗收清單與「仍是空的表」說明見 README「重建後驗收清單」。

**強化（同日追加）：觀測計數不再誤導（`lib/graph/observations.ts`）**
沒有任何 `product_entity` 時，`syncCostcoJpObservations` 原本回 `skippedNoEntity: 0`
（實測 300 筆全部沒對上，卻顯示 0 筆被跳過）。改為回 `products.length`，`tests/search-batch.test.ts` 增為 4 項。

### 待辦（3.0 後續）
- `YOUTUBE_API_KEY` 未設定 → Agent 1 雷達會自動跳過；要實測需補金鑰。
- 清冊檔（`~/costco-analysis/products_part*.md`）目前不在本機與外接碟，競業訊號只能等它回來。

## Phase 15：Graph 冷啟動與 `listed` 保護 ✅（2026-09-26 實作、09-27 補救）

問題：`product_entity` 只有競業直播清冊會建立，2.0 已發布商品不會自動轉成實體 →
重建後 Agent 1–5 無事可做，Graph 四張表（`price_observation`／`review_snapshot`／`score_snapshot`／`content_draft`）永遠是 0。

**新增 `scripts/bootstrap-entities.js`（`npm run bootstrap:entities`）**
- 2.0 商品 → `product_entity`：標準名「繁中譯名 > 英文名 > 日文名」、`canonical_name_jp` 存日文原名、
  產生關鍵字（供 `matchEntityByTitle` 的包含比對，正規化後 ≥ 4 字避免誤命中）。
- 以 `canonical_name + brand` 去重（與 unique 條件及 `import-livestream-signal.js` 一致）→ 可重複執行。
- 預設**預覽不寫入**，`--post` 才寫；預設只處理 `status='published'`，`--status=` 可擴大、`--limit=` 可限量。
- 已發布商品建立為 `listed`，其餘為 `candidate`。

**新增保護 `shouldSyncEntityStatus`（`lib/graph/pipeline.ts`）**
人工已上架的實體（`listed`）不因單次低分被自動標成 `rejected`（法規 `hardFail` 仍會淘汰）；
分數與決策照寫 `score_snapshot`，可追溯。`runDailyPipeline` 的 select 補上 `status`。
`tests/graph-engines.test.ts` 增 3 項。

**實跑與事故（2026-09-27）**
- 9/26 實測：`bootstrap:entities --post` 建立 56 筆實體、`agents:run` 評分 56 項（決策全 `reject`，
  因當時 `intent_score` 0／`reseller_signal` 0），本機 `listed` 保護生效。
- 9/27 09:31（Asia/Taipei 08:30）**部署端 cron 用尚未部署的舊程式碼**再跑一次，
  56 筆全部被標成 `rejected`（`last_activity_at` 集中在 00:30–00:31Z）。已還原為 `listed`
  —— 決策紀錄保留在 `score_snapshot`（9/26、9/27 各 56 筆），沒有任何歷史被抹掉。
- 教訓：這類「防止資料被錯誤改寫」的保護必須**先部署**再讓 cron 跑；否則本機修好、線上照樣改壞。

## Phase 16：前台定價誠實化與實體狀態修復 ✅（2026-09-30）

### 問題一：未定價商品顯示 `NT$0`
`/costco`、`/costco/product/[id]`、`/costco/live` 都用 `Math.round(p.taiwan_suggested_price || 0)`；
實測 155 筆已發布商品中 **75 筆**沒有定價（多為現場照片匯入的 `official_catalog_onsite_match`，
`scripts/seed-onsite-products.mjs` 依規則不推估價格），前台顯示成 `NT$0`，
且商品頁仍可加入購物車 → 會產生 0 元訂單。

**新增 `lib/price-display.ts`**：`hasSuggestedPrice`／`formatSuggestedPrice`／`formatJpyPrice`。
缺值或 0 顯示「未定價」（不再用 `|| 0` 補值，符合「價格不可推估」規則）；
未定價商品不顯示「加入購物車」；日幣價抓不到時不顯示（原本會顯示 `¥0`）。
`tests/price-display.test.ts`（4 項）鎖住行為。部署後實測 `/costco`：`未定價` 出現、`NT$0` 為 0。

### 問題二：被誤標的實體沒有修復工具
`bootstrap-entities.js` 只會「跳過已存在」，不修正狀態；9/27 被打成 `rejected` 的實體
只能手動改資料庫，因此 9/29、9/30 的 cron 又各打了一次。

**新增 `--repair`（`scripts/lib/entity-status.mjs`）**
- 純邏輯抽出成 `scripts/lib/entity-status.mjs`：`entityKey`／`canonicalName`／
  `expectedEntityStatus`／`planStatusRepairs`（`tests/entity-status.test.ts` 6 項）。
- 只還原「對應到 `status='published'` 商品、卻不是 `listed`」的實體，**單向不降級**。
- 預設預覽，`--post` 才寫入；與建立流程共用同一組比對鍵。

**部署與實測（同日）**
1. 先補推 `c746994`（listed 保護）與 `2a7158a`（定價），確認 Render 已上線。
2. `bootstrap:entities --repair`：預覽 52 筆 → `--post` 還原 52 筆（原狀態全為 `rejected`）。
3. 對**正式環境**跑 `npm run agents:run`：評分 52 項、決策分布 `{"reject":52}`（無信號屬正常），
   跑完 `product_entity` 仍是 **listed 52／rejected 4** → 保護在部署端確實生效。
4. 剩下 4 筆對應的商品本身是 `rejected`（尿布 ×2、`LDC コーン茶`、`オキシクリーン`），維持 `rejected` 正確。

**驗證**：`npm test` 20 檔／144 測試全過；`npm run build` 通過。

## Phase 17：缺定價核價流程 ✅（2026-09-30）

問題：Phase 16 修好「未定價不再顯示 NT$0」後，這批商品仍然**賣不掉** —— 而且專案原本
沒有任何把售價補回去的路徑：現場照片匯入（`official_catalog_onsite_match`）依規則不推估價格，
Agent 5 又只處理通過門檻的候選，`taiwan_suggested_price` 只能手動改資料庫。

**新增 `scripts/price-missing.mjs`（`npm run price:missing`）+ `scripts/lib/pricing.mjs`**
- 匯出清單：`review/missing_prices.html`（一頁核價：圖片、日文名、現行日幣價、促銷前原價、
  參考價、輸入框、「採用參考價」、「全部填入參考價」、匯出 CSV、進度條、localStorage 保留）＋ `.csv`。
- 參考價 = 日幣**現行價** × `JPY_TWD_RATE`（與 `lib/graph/listing-draft.ts` 同一組匯率，
  由 `scripts/lib/exclude-rules.mjs` 的 `JPY_TWD`／`toTwd` 共用）；`discount_price` 是促銷前原價
  （`lib/search.ts`），只列出來供判斷，不當現行價。
- **售價不自動寫入**：一定要匯出 CSV 再 `--apply`。寫入限制：`status='published'`、
  售價為正整數、已定價需 `--force`；每筆寫 `audit_logs`（`action=product_priced`，
  含原值 → 新值與來源 CSV）。`--dry-run` 可先看會寫什麼。
- 純邏輯（`currentJpy`／`needsPricing`／`referenceTwdFor`／`parseTwd`／`parsePriceCsv`／
  `planPriceUpdates`）集中在 `scripts/lib/pricing.mjs`，`tests/pricing.test.ts` 8 項。

**實測（2026-09-30）**
- `npm run price:missing`：已發布 155 筆 → 缺定價 **75 筆**，其中 **69 筆可算參考價**
  （6 筆無日幣價，需自行定價）。
- `--apply <測試 CSV> --dry-run`：可寫入 1 筆、略過 2 筆（`not_published`／`invalid_price`），
  千分位與「引號內逗號」都正確解析。
- 寫入路徑以 **no-op PATCH**（篩選不存在的 id）驗證 → HTTP 204 且未更動任何資料；
  `audit_logs` 欄位（`actor/action/entity_type/entity_id/detail`）與寫入形狀一致。
- 實際售價仍待人工核價後 `--apply`（不由程式決定）。

**驗證**：`npm test` 21 檔／152 測試全過。

## Phase 18：購物車系統完整化 ✅（2026-10-01）

### 問題一（嚴重）：結帳金額可被前端篡改
`/api/checkout` 原本直接採用前端傳來的 `unitPrice` 建立訂單。購物車存在瀏覽器
localStorage，任何人改一下就能用 1 元下單（訂單金額、`order_items.unit_price` 都會被寫入假價格）。

**修法：金額只由伺服器決定**（`lib/checkout-resolve.ts`）
- `checkoutSchema` 只接受 `productId` 與 `quantity`；`normalizeLines` 把偷帶的 `unitPrice`／`name`
  直接丟掉（zod 亦會 strip 未知欄位）。
- `buildResolvedCart` 以 `products` 表為準重取名稱與價格，逐項驗證
  `status='published'`、`taiwan_suggested_price > 0`、`in_stock !== false`（`null` 視為未標示，不阻擋）。
- 任一項不合格 → HTTP 409 + 問題清單，**整筆拒絕不部分成立**；`createOrder` 改為接收
  已解析的 `lines`，不再接觸前端價格。
- **缺貨是提醒不是硬擋**（`BLOCK_OUT_OF_STOCK`，預設 false）：跨境代購是下單後才去日本採購，
  且每日搜尋寫入的 `in_stock` 是抓取當下的狀態、可能過期。實測 2026-10-01 已發布 155 筆中
  有 50 筆 `in_stock=false`，硬擋會讓可購買商品由 80 筆掉到 34 筆（等於鎖住半個賣場），
  因此改為 `warnings`：結帳頁顯示「目前標示缺貨，下單後確認，無法採購會通知退款或換貨」。
  真正缺貨的處理放在採購階段（與運費閘門同一套人工流程）。要改成硬擋設 `BLOCK_OUT_OF_STOCK=true`。

### 問題二：購物車功能不完整
原本只有「+/− 數量」與「移除」，且價格會停留在加入當時（商品改價、下架、變成未定價都不會反映），
也沒有數量徽章、清空、跨分頁同步、結帳摘要、訂單查詢。

**新增**
- `lib/cart.ts`：`parseCart`（壞資料一律丟棄、同商品合併、上限截斷）、`addToCart`／`setQuantity`／
  `removeFromCart`、`cartCount`／`cartSubtotal`、`readCart`／`writeCart`／`clearCart`、
  `subscribeCart`（同分頁自訂事件 + 其他分頁 `storage` 事件）；`MAX_QUANTITY=99`、`MAX_ITEMS=30`。
- `lib/order-status.ts`：訂單狀態中文標籤與說明、`ORDER_FLOW` 進度、運費閘門標籤、個資遮罩。
- `POST /api/cart/validate`：購物車即時校正（不寫入資料），購物車頁與結帳頁都用它取得權威價格。
- `POST /api/orders/lookup`：訂單查詢需「訂單編號 + 下單手機」同時正確。
- 頁面：`/costco/cart`（數量輸入、移除、清空、問題項目一鍵移除、小計與目前應付、擋住未通過的結帳）、
  `/costco/checkout`（先校正、顯示權威金額與訂單摘要、送出後清空購物車）、
  `/costco/success`（訂單明細／金額／進度／遮罩後的收貨資訊）、`/costco/orders`（查詢與進度）。
- `components/cart-badge.tsx`：標頭購物車數量徽章（跨分頁即時）。
- `lib/orders.ts`：`getPublicOrderView`、`lookupOrder`（手機比對只看數字），回傳一律遮罩。

### 驗證
- `npx vitest run`：25 檔／**200 測試全過**（新增 cart 17、checkout-resolve 11、order-status 8、
  validation 2、orders-flow 8）。`tests/orders-flow.test.ts` 用**記憶體假 Supabase** 驗證訂單
  寫入的 payload（金額、`order_items` 保存下單當時名稱與價格、`shipping_fee_status=pending`）
  與查詢授權（手機不符／格式不足一律查不到、回傳不含身分證字號）——不在正式資料庫塞測試訂單。
- `npm run build`：通過。
- 本機對正式 Supabase 實測（皆不寫入資料）：`POST /api/cart/validate` 夾帶 `unitPrice: 1`
  → 回應為資料庫價格 312，且缺貨回 `warnings` 不擋單；未發布商品回 `not_published`；
  `POST /api/checkout` 帶未定價商品 → **409 且在建立訂單前就被擋下**（`orders` 仍為 0 筆）。
  未建立真實測試訂單，避免污染正式訂單資料。

## Phase 19：修正「沒有庫存資料被記成缺貨」✅（2026-10-01）

### 發現
使用者問「我們並沒有輸入庫存，為什麼會缺貨」。追查後確認這是**資料錯誤，不是真的缺貨**：

- `lib/costco-api.ts` 原本寫 `inStock: p.stock?.stockLevelStatus === STOCK_IN_STOCK`。
  官方沒有回報庫存時（`stock` 缺欄位）運算式是 `undefined === "inStock"` → **false**，
  於是把「沒有資料」記成「缺貨」。
- 證據（依來源分組，`products` 已發布 155 筆）：

  | 來源 | 筆數 | in_stock=true | in_stock=false |
  |---|---|---|---|
  | `official_rest_api` | 41 | 41 | 0 |
  | `official_catalog_onsite_match` | 66 | 64 | 2 |
  | `official_sell_count`（舊 top50 抓取） | 17 | 0 | **17** |
  | `official_category`（舊分類抓取） | 31 | 0 | **31** |

  兩個舊來源「從來沒有出現過 true」＝欄位不存在被預設成 false 的特徵，不是真實庫存。

### 修法
1. `lib/costco-api.ts` 抽出 `stockStatusOf()`：官方沒回報時回 **undefined**，
   由 `lib/search.ts` 略過寫入（`if (raw.inStock !== undefined)`），不再覆蓋成 false。
   `tests/costco-api.test.ts` 增 4 項（含「mapOfficialProduct 不再把缺欄位記成缺貨」）。
2. 資料修正：`in_stock=false` 且來源為 `official_sell_count`／`official_category` 的
   **52 筆改為 `null`（未標示）**，並寫入 `audit_logs`（`product_stock_corrected`）。
   來自官方目錄（真的有 `stock` 欄位：全目錄 inStock 9907／outOfStock 479）的資料保留不動。

### 修正後（實測）
- 已發布 155 筆、有台幣定價 **80 筆（可下單）**；80 筆中 in_stock=true 34、false 0、未標示 46。
- 全站仍標示缺貨的已發布商品只剩 **2 筆**（`jp-54201`、`jp-60986`，來自官方目錄的真實狀態）。
- 購物車不再對「沒有資料」的商品顯示缺貨提醒。

### 一併釐清（使用者提問）
- **可下單數量是 80 筆，不是 34 筆**：34 是「有價且 in_stock=true」的數字，只在缺貨硬擋時才有意義；
  已在 Phase 18 改為「缺貨只提醒、不擋單」，所以現在 80 筆都能下單。
- **Costco 站沒有會員帳號系統**：買家不需要註冊，訂單以「訂單編號 + 下單手機」查詢；
  唯一的登入是後台的單一密碼（`ADMIN_PASSWORD`），沒有 users 表。
  Supabase 這個專案（`ktqupvrefxejjjsacbqd`）與另一個系統共用，看到 `users`（1 筆，林博／admin）、
  `facebook_accounts`、`buyer_requirements` 等表屬於那個系統，不是 Costco 的（README 已有此警示）。
