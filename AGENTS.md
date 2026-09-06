# JP Costco 專案協作規則

本專案由 AI 與使用者共同維護。請遵守以下規則。

## 重要原則（依規格書）
- 搜尋系統與購物系統**分開**。
- 商品搜尋結果先進入**待審核**，不直接上架。
- 只有**已發布**的商品集合會顯示在購物網站。
- 訂單保存下單當時的商品名稱與價格。
- **身分證字號**不可放在 LINE、網址、前端 console 或錯誤紀錄；後台以遮罩顯示。
- 每日搜尋失敗時，網站繼續顯示上一期已發布商品。
- 日本特色商品不足 50 項時，不使用全球商品硬湊。
- Google Drive 現場照片以 `drive_file_id` 為唯一鍵；不可只掃前 100 張。
- Drive 清冊與檔案連結只能寫入私人 Supabase Queue，不可提交到公開 GitHub。
- HEIC 與 MOV 都必須進 Queue；MOV 後續抽取 Key Frames，不可排除。
- HEIC JPEG 與 MOV Key Frames 只存於私有 `costco-onsite-media` bucket，不可建立 public policy。
- 舊 AI 辨識是 Candidate Data，回看原圖確認後才能標記 `VERIFIED`。
- 單一價格不是特價證據；需有 OFF／値引／期限等明確促銷文字。

## 3.0 Product Intelligence Graph 規則
- 新表一律 `create table if not exists` + RLS enable（service_role 存取），**不覆蓋 2.0 既有表**。
- 所有評分與決策寫入 `score_snapshot`（可追溯）；門檻集中在 `lib/graph/config.ts`，不寫死。
- Astra 只做五件事（實體比對/意圖/影片理解/適合度/採購決策）且僅限通過 Agent 3 門檻的候選；無金鑰時規則引擎接管，系統照常運作。
- 競業直播帶貨清冊與 `reseller_mention` 資料只寫 Supabase，**不可提交到公開 GitHub**。
- 訂單擴充（運費閘門 `shipping_fee_status`）只能新增欄位，不可破壞既有訂單流程。
- Agent 6 API（皆需 `isAdmin()`）：`GET/POST /api/admin/procurement`（採購清單＋LINE 通知）、`POST /api/admin/orders/shipping-fee`（運費閘門 `pending → confirmed → paid`）；後台頁 `/admin/procurement`。LINE 訊息只含訂單編號與金額，不含客戶個資。
- Vision 辨識與配對輸出一律 CANDIDATE / NEEDS_REVIEW；未設定 vision 金鑰時批次自動跳過，不可阻塞其他流程。
- 配對 → `weekly_store_deals` 只處理人工 VERIFIED 的配對（`lib/vision/deals.ts`）：產出一律 `draft`／`UNVERIFIED`，無促銷文字證據即清空特價欄位，照片存私有 bucket 路徑（讀取端轉 signed URL），已發布 deal 不覆蓋。
- Agent 5 自動文案：通過門檻商品產生 `content_draft`（產出一律 `draft`；已有 draft／approved 不重複產生；promo 欄位不得憑空產生，需明確促銷文字證據）。人工核准後才建立 2.0 商品並沿用 `lib/publish.ts` 共用發布流程（`/api/admin/products/publish` 同一條路徑）；排程發布由 `GET /api/cron/publish-scheduled?secret=<CRON_SECRET>` 於到期時執行，核准前商品不進商業端。

## 技術
- Next.js + TypeScript + Tailwind CSS
- SQLite（node:sqlite，同步、免編譯）
- Zod 表單驗證
- 手機優先、RWD、適合 LINE 內建瀏覽器

## 常用指令
```bash
npm run dev        # 開發
npm run build      # 建置
npm run db:init    # 初始化本地 SQLite（遺留；正式資料層為 Supabase）
npm run seed       # 加入測試資料
npm run search:run # 手動執行每日搜尋（SQLite 遺留；cron 走 /api/cron/run-search → Supabase）
npm test           # 執行測試

# 3.0：Agent 5 排程發布（已核准且到期的 content_draft → 既有 publish 流程；每日 cron 呼叫）
# curl "http://localhost:3000/api/cron/publish-scheduled?secret=<CRON_SECRET>"

# 3.0：競業直播帶貨清單匯入 Graph（清冊不提交 GitHub）
node scripts/import-livestream-signal.js <md檔...> --reseller-key skyblue --platform facebook --video-date 2026-09-06
```

## 後台權限
- 後台需登入：環境變數 `ADMIN_PASSWORD`（未設定時預設 `changeme`）。
- 管理操作走 API route（`/api/admin/*`），全部需 `isAdmin()` 檢查。
- 每日搜尋端點：`GET /api/cron/run-search?secret=<CRON_SECRET>`。

## 重要：不要用「含 redirect() 的 Server Action」
本專案的 Next.js 版本（15.x + React 19）在 `next start` 下，Server Action 呼叫 `redirect()` 會觸發 `Connection closed`（digest 1962105350）。請改用 **Route Handler + 客戶端元件**（fetch API 後 `router.refresh()` / `window.location`）做管理操作。

## 敏感資料
- 不把 API Token、LINE token、身分證字號寫入程式碼或 commit。
- 使用環境變數（`.env`，且加入 `.gitignore`）。

## 完成工作
1. 執行 `npm test` 與 `npm run build`。
2. 更新 `README.md` 與本檔。
3. 以 `copilot:` 前綴 commit。
