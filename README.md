# 日本 Costco 商品搜尋與獨立購物系統

依規格書建立的系統：每天早上搜尋日本 Costco 特色商品，審核後發布到手機優先的購物網站，透過 LINE 官方帳號導流，並收集報關資料、建立訂單。

## 技術架構
- **Next.js** + **TypeScript** + **Tailwind CSS**
- **SQLite**（better-sqlite3）本地資料庫（正式環境可換成 Supabase PostgreSQL）
- **Zod** 表單驗證
- Server Actions / REST API

## 快速開始
```bash
npm install
npm run db:init   # 初始化資料庫
npm run seed      # 加入測試商品
npm run dev       # 啟動開發伺服器
```

## 主要頁面
| 路徑 | 功能 |
|------|------|
| `/costco` | 本期日本 Costco 精選商品總覽 |
| `/costco/product/[id]` | 單一商品介紹頁 |
| `/costco/cart` | 購物車（localStorage） |
| `/costco/checkout` | 結帳與報關資料表單 |
| `/costco/success` | 訂單完成頁 |
| `/admin` | 後台（商品審核/發布、訂單管理、搜尋批次） |

## 每日搜尋
```bash
npm run search:run   # 手動執行一次每日搜尋
```
正式環境可設定 cron 於每天早上 08:00 執行。

## 重要原則（依規格書）
- 搜尋結果先進入**待審核**，不會直接上架。
- 只有**已發布**的商品集合會顯示在購物網站。
- 訂單保存下單當時的商品名稱與價格。
- 身分證字號不可放在 LINE、網址、前端 console 或錯誤紀錄；後台以遮罩顯示。
- 日本特色商品不足 50 項時，不使用全球商品硬湊。

## 環境變數
| 變數 | 說明 |
|------|------|
| `DB_PATH` | SQLite 路徑（預設 `data/jp-costco.db`） |
| `SITE_URL` | 網站網址（LINE 導線用） |
| `LINE_PHASE` | LINE 銜接階段（`1` 或 `2`） |
| `LINE_CHANNEL_ACCESS_TOKEN` | 第二階段 LINE Messaging API token |
| `LINE_ADMIN_ID` | 管理員 LINE ID |
| `ADMIN_PASSWORD` | 後台登入密碼（未設定時預設 `changeme`，正式環境務必設定） |
| `CRON_SECRET` | 每日搜尋 cron 的保護密鑰 |
| `SUPABASE_ACCESS_TOKEN` | Supabase 管理 API 個人權杖 |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase 持久化資料庫（尚未啟用） |

## 後台權限控管
- `/admin/*` 需登入（`ADMIN_PASSWORD`），未登入會導向 `/admin/login`。
- 管理操作（核准/發布/改訂單狀態/匯出）透過受保護的 API route 執行，未授權回傳 401。
- 身分證字號一律遮罩顯示。

## 每日搜尋 cron
- 觸發端點：`GET /api/cron/run-search?secret=<CRON_SECRET>`（或 header `x-cron-secret`）。
- 由 `render.yaml` 的 Cron Job 於每天 08:00 (Asia/Taipei) 呼叫。
- 搜尋失敗時回傳 500 並保留上一期已發布商品。

> 本系統僅供研究與開發，實際報關請依現行法規與報關業者要求執行。
