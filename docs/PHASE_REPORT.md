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

## Phase 8：通知與部署 ⚠️（部分完成）
- `lib/line.ts`：LINE 第一階段（網站網址）就緒；第二階段（Messaging API）需設定環境變數。
- 部署（Render/GitHub Pages）與 cron、備份、錯誤監控**尚未設定**。

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
