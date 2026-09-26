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
- **3.0 Graph 缺少 bootstrap**：`product_entity` 目前只有競業直播清冊會建立，2.0 已發布商品不會自動轉成實體，
  因此重建後（或全新環境）Agent 1–5 無事可做；清冊檔（`~/costco-analysis/products_part*.md`）目前不在本機與外接碟。
