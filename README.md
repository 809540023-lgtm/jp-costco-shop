# 日本 Costco 商品搜尋與獨立購物系統

依規格書建立的系統：每天早上搜尋日本 Costco 特色商品，審核後發布到手機優先的購物網站，透過 LINE 官方帳號導流，並收集報關資料、建立訂單。

## 技術架構
- **Next.js** + **TypeScript** + **Tailwind CSS**
- **Supabase PostgreSQL**（持久化資料層；`lib/supabase.ts` service role + RLS 私有表）
- **Zod** 表單驗證
- Server Actions / REST API

## JP Costco Shop 3.0 — AI Autonomous Commerce（進行中）
以 Product Intelligence Graph 為核心的自動化 commerce 系統（SPEC：`~/JP-Costco-3.0-SPEC/SPEC.md`，審查報告 `docs/3.0_AUDIT.md`）：

| 模組 | 位置 | 說明 |
|---|---|---|
| Graph schema | `supabase/migrations/20260907000000_product_intelligence_graph.sql` | product_entity / source_listing / reseller_mention / price_observation / intent_signal / logistics_profile / review_snapshot / score_snapshot / content_draft + 訂單擴充欄位 + 漏斗視圖 |
| Agent 1 商品雷達 | `lib/graph/youtube-radar.ts` | YouTube Data API 代購影片 → Reseller Promotion Signal（`lib/graph/reseller-signal.ts`） |
| Agent 2 購買意圖 | `lib/graph/intent-classifier.ts` | 規則引擎分類 9 種意圖（want_buy/exists_tw 等）＋ intent_score |
| Agent 3 適合度 | `lib/graph/suitability.ts` | Taiwan Daigou Suitability Score；`tw_import_ok=false` 硬性淘汰 |
| Agent 4 AI 採購主管 | `lib/graph/decision.ts` | 決策映射（reject/observe/list/top50/weekly_pick/hot_candidate）；Astra 僅處理通過門檻的候選，無金鑰自動降級規則 |
| Agent 5 自動營運 | `lib/graph/listing-draft.ts` | 自動產生繁中草稿（content_draft）→ 人工核准 → 既有 publish 流程 |
| Agent 6 訂單與採購 | `lib/graph/procurement.ts` | 採購清單彙總、運費閘門（唯一人工卡點）、待出貨整理 |
| 👁️ Vision 辨識 | `lib/vision/vision-client.ts`、`lib/vision/pipeline.ts` | 現場照片/價牌 → 結構化候選（costco_vision_candidates）；單一價格非特價證據；情境照標記 CONTEXT_ONLY；無金鑰時自動跳過 |
| 🔗 商品/價牌配對 | `lib/vision/pairing.ts` | Item Number/JAN 強證據＋品牌/名稱/規格/時間綜合評分；檔名僅微弱加分（不可只靠檔名連號）；產出 NEEDS_REVIEW 候選 |
| 🏷️ 特價草稿（配對 → weekly_store_deals） | `lib/vision/deals.ts` | 僅處理人工 VERIFIED 的配對；無促銷文字證據時清空特價欄位（單一價格非特價）；產出一律 draft／UNVERIFIED，人工補中文譯名後發布 |
| 每日管線 | `app/api/cron/run-agents`、`lib/graph/pipeline.ts` | cron 每日 08:30：雷達 → 評分 → 決策 → score_snapshot |
| 直播訊號匯入 | `scripts/import-livestream-signal.js` | 競業直播帶貨清單（如 `~/costco-analysis/products_part*.md`）寫入 Graph；清冊不提交 GitHub |
| Dashboard | `/admin` 首頁 | `v_dashboard_funnel` 今日漏斗 + 待採購件數 |

門檻與權重全部集中在 `lib/graph/config.ts`（可用環境變數覆寫）。

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
| `/costco/live` | 美洲區好市多 · 每週商品直播（含一鍵截圖儲存） |
| `/costco/deals` | 日本 Costco 現場商品／特價（人工確認後發布） |
| `/costco/product/[id]` | 單一商品介紹頁 |
| `/costco/cart` | 購物車（localStorage） |
| `/costco/checkout` | 結帳與報關資料表單 |
| `/costco/success` | 訂單完成頁 |
| `/admin` | 後台（商品審核/發布、訂單管理、搜尋批次） |
| `/admin/onsite` | 現場照片 Queue、Vision、配對、特價草稿與審核入口 |

## 每日搜尋
```bash
npm run search:run   # 手動執行一次每日搜尋
npm run top50        # 抓取前 50 名熱門商品（依官方 sellCount 排序，含完整說明與其他通路價格比較）
```
正式環境可設定 cron 於每天早上 08:00 執行。

## 商品頁內容
每個商品頁會顯示：
- 商品說明、商品重點、規格與功能（抓自 Costco 官方詳情）
- 其他通路價格比較（Yahoo 購物 JPY、Amazon JP）與日本 Costco 參考價

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
| `GOOGLE_DRIVE_API_KEY` | 後台完整掃描公開共享 Costco Drive 資料夾；只放部署環境，不提交 GitHub |
| `GOOGLE_DRIVE_ACCESS_TOKEN` | 私有 Drive 資料夾可改用 OAuth access token；只放部署環境，不提交 GitHub |
| `COSTCO_DRIVE_FOLDER_ID` | Costco 現場照片資料夾 ID |
| `LIVE_STREAM_URL` | 直播串流網址（`.m3u8` 或 `.mp4`；未設定時用示範串流） |
| `YOUTUBE_API_KEY` | Agent 1 YouTube 代購影片雷達（未設定時雷達跳過） |
| `ASTRA_ENDPOINT` / `ASTRA_API_KEY` / `ASTRA_MODEL` | Astra（OpenAI 相容 endpoint）；僅用於實體比對、意圖、影片理解、適合度、採購決策。未設定時全程規則引擎 |
| `SOL_ENDPOINT` / `SOL_API_KEY` / `SOL_MODEL` | 一般文案/翻譯/摘要用較低成本模型（未設定沿用 Astra 或規則） |
| `VISION_ENDPOINT` / `VISION_API_KEY` / `VISION_MODEL` | 現場照片辨識（OpenAI 相容 vision；未設定沿用 Astra，兩者皆無時後台顯示已跳過） |
| `JPY_TWD_RATE` | 匯率（計算層集中轉換，預設 0.22） |
| `SUITABILITY_THRESHOLD` / `INTENT_THRESHOLD` 等 | 3.0 門檻覆寫（見 `lib/graph/config.ts`） |

## 後台權限控管
- `/admin/*` 需登入（`ADMIN_PASSWORD`），未登入會導向 `/admin/login`。
- 管理操作（核准/發布/改訂單狀態/匯出）透過受保護的 API route 執行，未授權回傳 401。
- 身分證字號一律遮罩顯示。

## 每日搜尋 cron
- 觸發端點：`GET /api/cron/run-search?secret=<CRON_SECRET>`（或 header `x-cron-secret`）。
- 由 `render.yaml` 的 Cron Job 於每天 08:00 (Asia/Taipei) 呼叫。
- 搜尋失敗時回傳 500 並保留上一期已發布商品。

> 本系統僅供研究與開發，實際報關請依現行法規與報關業者要求執行。

## Costco 現場照片管線

現場照片固定由 [Google Drive 資料夾](https://drive.google.com/drive/folders/1_Ryc7z4Et-M5lRA0q96gIUfYPDX8TelB) 匯入，使用 Drive File ID 去重。完整規則與 2026-09-01 實際盤點請見 [`docs/COSTCO_ONSITE_HANDOVER.md`](docs/COSTCO_ONSITE_HANDOVER.md)。

- 2026-09-01 已驗證 Drive 共有 150 個檔案（149 張 HEIC 相片、1 支 MOV 影片）。
- 後台 `/admin/onsite` 的 Drive Sync 使用完整 pagination，將 HEIC 與 MOV 全部寫入私人 Supabase Queue。
- 後台分批處理 HEIC（轉 JPEG）與 MOV（最多擷取 6 張 Key Frames）；衍生檔只存於私有 Supabase Storage。
- Vision 辨識 → 商品/價牌配對後，人工將配對標記 `VERIFIED`，再由後台「已確認配對 → 產生特價草稿」批次寫入 `weekly_store_deals`（`id=onsite-<商品照ID>`，draft／UNVERIFIED）。照片以私有 bucket 路徑儲存，前台 `/costco/deals` 讀取時轉 signed URL；人工發布前需補中文譯名。
- 部署前須套用兩個 `20260901` migration，並設定 `SUPABASE_SERVICE_ROLE_KEY` 與 `GOOGLE_DRIVE_API_KEY`（或 `GOOGLE_DRIVE_ACCESS_TOKEN`）。
- Drive File ID、原始檔案連結與處理清冊不提交到公開 GitHub。
