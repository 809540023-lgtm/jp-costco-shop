# 日本 Costco 商品搜尋與獨立購物系統

依規格書建立的系統：每天早上搜尋日本 Costco 特色商品，審核後發布到手機優先的購物網站，透過 LINE 官方帳號導流，並收集報關資料、建立訂單。

## 技術架構
- **Next.js** + **TypeScript** + **Tailwind CSS**
- **Supabase PostgreSQL**（唯一持久化資料層；`lib/supabase.ts` service role + RLS 私有表）
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
| Agent 5 自動營運 | `lib/graph/listing-draft.ts`、`lib/graph/content.ts`、`lib/publish.ts` | 自動產生繁中草稿（content_draft）→ 後台 `/admin/drafts` 一鍵核准／排程 → 沿用既有 publish 流程（`lib/publish.ts` 共用）；排程到期由 `GET /api/cron/publish-scheduled?secret=<CRON_SECRET>` 自動發布並 LINE 通知 |
| Agent 6 訂單與採購 | `lib/graph/procurement.ts`、`lib/orders.ts`、`lib/line.ts` | 採購清單彙總、運費閘門（唯一人工卡點）、待出貨整理；後台 `/admin/procurement`、訂單頁運費閘門表單、API `GET/POST /api/admin/procurement`、`POST /api/admin/orders/shipping-fee`；cron 有待採購時自動 LINE 通知 |
| 👁️ Vision 辨識 | `lib/vision/vision-client.ts`、`lib/vision/pipeline.ts` | 現場照片/價牌 → 結構化候選（costco_vision_candidates）；單一價格非特價證據；情境照標記 CONTEXT_ONLY；無金鑰時自動跳過 |
| 🔗 商品/價牌配對 | `lib/vision/pairing.ts` | Item Number/JAN 強證據＋品牌/名稱/規格/時間綜合評分；檔名僅微弱加分（不可只靠檔名連號）；產出 NEEDS_REVIEW 候選 |
| 🏷️ 特價草稿（配對 → weekly_store_deals） | `lib/vision/deals.ts` | 僅處理人工 VERIFIED 的配對；無促銷文字證據時清空特價欄位（單一價格非特價）；產出一律 draft／UNVERIFIED，人工補中文譯名後發布 |
| 📊 Costco 官方擷取 | `lib/costco-api.ts`（主要）、`lib/costco-fetch.ts`（HTML 備援） | 每日搜尋主要來源改為官方 REST API：價格、評分、評論數、圖片、庫存、英文名、官方標籤（Hot Buy／Made In Japan）。HTML 解析只在 API 失敗時接手（僅有商品連結） |
| 🧩 實體比對與觀測 | `lib/graph/entity-match.ts`、`lib/graph/observations.ts` | 官方商品 → `product_entity` 比對（完全相等／唯一包含才命中，模糊回 null）；命中後寫入 `price_observation`（costco_jp，is_promo）與 `review_snapshot`（jp，avg_rating/review_count），同日重跑不重複寫入 |
| 每日管線 | `app/api/cron/run-agents`、`lib/graph/pipeline.ts` | cron 每日 08:30：雷達 → 評分 → 決策 → score_snapshot → Agent 5 自動文案草稿；Agent 3 的 `avgRating` 讀取 `review_snapshot` 真實評分 |
| 直播訊號匯入 | `scripts/import-livestream-signal.js` | 競業直播帶貨清單（如 `~/costco-analysis/products_part*.md`）寫入 Graph；清冊不提交 GitHub |
| Dashboard | `/admin` 首頁 | `v_dashboard_funnel` 今日漏斗 + 待採購件數 |

門檻與權重全部集中在 `lib/graph/config.ts`（可用環境變數覆寫）。

## 快速開始
```bash
npm install
npm run check:supabase   # 確認資料層（Supabase）DNS／金鑰／資料表都正常
npm run dev              # 啟動開發伺服器
```

## 資料層健檢與復原

Supabase 是 2.0 商品／訂單與 3.0 Graph 的正式資料層。專案被刪除、改名或金鑰失效時，程式不會在 build 階段報錯（`lib/supabase.ts` 有 build placeholder），但執行期查詢與寫入會全部失敗。用這支腳本先確認：

```bash
npm run check:supabase          # 逐項檢查 DNS、REST 金鑰、28 張資料表
node scripts/check-supabase.js --json   # 給自動化用的 JSON 輸出（異常時 exit 1）
```

輸出會指出壞在哪一層（DNS／金鑰／缺表），並標出缺表對應的 migration 檔。

### 復原步驟

> 補充：資料層掛掉時，**公開頁面不會再 500**。`/costco/deals` 走 `getPublishedWeeklyDealsSafe()`
> （`lib/onsite-deals.ts`），連線失敗時顯示「現場商品暫時無法讀取」提示並繼續提供其他頁面；
> 管理端仍使用會拋出錯誤的原始函式，方便看出問題。新增公開頁面請照此模式。

1. 登入 <https://supabase.com/dashboard> 確認該專案是「被刪除」還是「被暫停」。暫停（free plan 閒置）可直接 Restore；刪除則無法復原，需重建。
2. 重建專案後，把新的 `SUPABASE_URL`／`SUPABASE_ANON_KEY`／`SUPABASE_SERVICE_ROLE_KEY` 寫進 `.env`，並同步更新 **Render 的環境變數與 `render.yaml` 內硬編碼的 URL**。
3. 套用 schema（依序）：
   - `supabase/schema.sql`（2.0 既有表）
   - `supabase/migrations/*.sql`（3.0 Graph、Vision、Agent 5，依檔名時間排序）
   本機有 `psql` 時可直接連線；否則用 CLI `supabase link --project-ref <ref>` + `supabase db push`，或在 Dashboard SQL Editor 貼上。
   金鑰換新後可重跑 `npm run check:supabase` 確認 28 張表都到位。
4. 重新匯入資料：`node scripts/seed-supabase.js`（已發布商品快照）、`node scripts/import-livestream-signal.js ...`。
5. 私有 bucket 需重建：`costco-onsite-media`（**不可**設 public policy）。

### 一鍵重建（`npm run rebuild:supabase`）

上述步驟 2～4 已腳本化，會依序產出 SQL 套用順序、種子指令、Render 環境變數清單與驗收檢查表：

```bash
npm run rebuild:supabase                              # 唯讀：檢查現況＋產出 supabase/rebuild.sql
npm run rebuild:supabase -- --all                      # 套 schema → 灌種子 → 驗收
npm run rebuild:supabase -- --url=<新URL> --update-render --all
npm run rebuild:supabase -- --check                    # 只跑驗收檢查表
```

- **SQL 套用順序**：`supabase/schema.sql` → `supabase/migrations/*.sql`（依檔名時間）。
  全部為 `if not exists`，可重複執行；串接後輸出 `supabase/rebuild.sql`（已 gitignore）。
- **套用路徑自動挑選**：`psql`＋`SUPABASE_DB_URL`（最穩）→ Supabase Management API＋`SUPABASE_ACCESS_TOKEN`
  → 皆無則提示把 `rebuild.sql` 貼進 Dashboard SQL Editor。
  （Supabase 的 PostgREST 只做資料 CRUD，**不能執行 DDL**，所以不能只用 service_role key 建表。）
- **靜態驗證**：腳本會先檢查 28 張表是否齊全、有沒有指向不存在表格的 `alter table`／`create index`
  （`if exists` 會靜默跳過，是重建時最容易漏掉的地方）。
- **Render 檢查**：`render.yaml` 內硬編碼的 `SUPABASE_URL` 一旦指向舊專案就會被標出並附行號；
  `--update-render --url=<新URL>` 可一次換掉（缺 `--url` 會擋下，避免換成空值）。
  同時列出所有 `sync: false`（需在 Render Dashboard 手動設定）的變數，並標示哪些本機 `.env` 已有值。
- `--url` **只影響本次執行、不寫 `.env`**，避免把新 URL 配上舊金鑰造成不一致；腳本會印出該改哪三行。

### 匯入現場照片商品（`npm run seed:onsite`）

把現場照片萃取的產品主檔轉成 `products` 表可匯入的種子：

```bash
npm run seed:onsite                     # 產生 scripts/onsite-products-seed.json 並顯示摘要
npm run seed:onsite -- --post           # 產生後直接 upsert 進 Supabase
npm run seed:onsite -- --in=<goldset 路徑> --out=<輸出路徑>
```

- 來源為 repo 外的 gold set 目錄（預設 `~/Desktop/好市多２０２６０９-goldset`），內含
  `product_master.json`（跨境／法規判定）與 `official_matches.json`（官方目錄比對）。
- 依 `AGENTS.md` 硬規則處理：
  - `status` 一律 `pending_review`，**不直接上架**（需人工審核後才發布）
  - 缺值欄位**一律省略**，不寫 `null`
  - **不寫 `discount_price`**：現場價牌未經人工 VERIFIED，單一價格不構成特價
  - **不推估** `taiwan_suggested_price`／`logistics_cost`／`landed_cost`
  - `regulation_risk` **只用官方商品名判定**，不採用照片 OCR 文字
    （OCR 會混入鄰近貨架商品的字，曾把行李箱誤標成「食品」；無官方對應時標示「未確認」）
  - 不寫 GPS、照片檔名、Drive 連結（此類清冊資料只進私人 Queue）
- 產出檔已 gitignore；`--post` 以 50 筆一批 upsert，以 `id` 去重。

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
| `/admin/drafts` | Agent 5 自動文案草稿（核准發布／排程自動發布／取消排程） |
| `/admin/onsite` | 現場照片 Queue、Vision、配對審核（VERIFIED／REJECTED）、特價草稿編輯與發布入口 |

## 每日搜尋
```bash
npm run search:run   # 手動執行一次每日搜尋（等同 cron：呼叫 /api/cron/run-search）
npm run agents:run   # 手動執行商品智慧管線（等同 cron：呼叫 /api/cron/run-agents）
npm run compare:sync -- --limit=20   # 補「其他通路價格比較」（Yahoo 購物／Amazon JP → Supabase）
```
`search:run` / `agents:run` / `publish:run` 都是 `scripts/run-cron.mjs` 的包裝：直接以 `x-cron-secret` 呼叫 API route，
因此**手動執行與 cron 走完全相同的 Supabase 路徑**（3.0 以前的手動 SQLite 路徑已在 Phase 14 移除）。
需要伺服器已啟動（`npm run dev`），也可用 `--base=https://jp-costco-shop.onrender.com` 直接打正式環境。

正式環境由 `render.yaml` 的 cron 於每天早上 08:00（搜尋）與 08:30（商品智慧管線）執行。

### 擷取來源與欄位
`GET /api/cron/run-search` 的商品來源順序：

1. **官方 REST API**（`lib/costco-api.ts`）：`https://www.costco.co.jp/rest/v2/japan/products/search?query=:sellCount-desc`
   預設抓 3 頁 × 100 筆（可用 `COSTCO_FETCH_PAGES` 調整，上限 20 頁）。
2. **HTML 備援**（`lib/costco-fetch.ts`）：僅在 API 完全失敗時接手，只能取得商品連結。

兩者都失敗時回傳 500 且**不寫入任何批次**，網站繼續顯示上一期已發布商品。

官方欄位對應到 2.0 `products`：

| 官方欄位 | 寫入欄位 | 說明 |
|---|---|---|
| `price.value` | `jp_price` | 官方現行售價（含促銷價） |
| `basePrice.value` | `discount_price` | 官方促銷前原價，**僅在具明確促銷證據時寫入**（單一價格不算特價） |
| `averageRating` | `rating` | 日本官方評分 |
| `numberOfReviews` | `review_count` | 評論數（排名引擎 reviews 權重 0.6 的依據） |
| `images` | `image_url` | 優先 `zoom` > `product` > `thumbnail` |
| `decalData` | `is_hot_buy` / `japan_exclusive_note` | 官方標籤 `Hot Buy`／`Made In Japan`（Made In Japan 使 `japanExclusive` 由 0.4/0.9 提升為 1.0） |
| `stock` | `in_stock` | `stockLevelStatus = inStock` |

缺值的欄位**不會寫入**（PostgREST upsert 只更新 payload 內欄位），因此某日來源失敗時不會把既有價格／評分／圖片覆蓋成 null。

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
| `SITE_URL` | 網站網址（LINE 導線用） |
| `LINE_PHASE` | LINE 銜接階段（`1` 或 `2`） |
| `LINE_CHANNEL_ACCESS_TOKEN` | 第二階段 LINE Messaging API token |
| `LINE_ADMIN_ID` | 管理員 LINE ID |
| `ADMIN_PASSWORD` | 後台登入密碼（未設定時預設 `changeme`，正式環境務必設定） |
| `CRON_SECRET` | 每日搜尋 cron 的保護密鑰 |
| `COSTCO_FETCH_PAGES` | 每日搜尋向官方 API 抓取的頁數（預設 3，每頁 100 筆） |
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
- 流程：官方 API 擷取（價格／評分／評論數／圖片／標籤）→ 寫入待審核商品 → 同步 Graph 價格與評價觀測。
- 搜尋失敗時回傳 500 並保留上一期已發布商品（所有來源皆失敗時不建立空批次）。
- 可選環境變數：`COSTCO_FETCH_PAGES`（預設 3）。

## Agent 5 自動營運 cron
- `GET /api/cron/run-agents?secret=<CRON_SECRET>`（每日 08:30）：評分決策後自動為通過門檻的商品產生繁中文案草稿。
- `GET /api/cron/publish-scheduled?secret=<CRON_SECRET>`：把已核准且排程到期的 `content_draft` 沿用既有 publish 流程發布（建立 2.0 商品 → 本期 collection），完成後 LINE 通知。

> 本系統僅供研究與開發，實際報關請依現行法規與報關業者要求執行。

## Costco 現場照片管線

現場照片固定由 [Google Drive 資料夾](https://drive.google.com/drive/folders/1_Ryc7z4Et-M5lRA0q96gIUfYPDX8TelB) 匯入，使用 Drive File ID 去重。完整規則與 2026-09-01 實際盤點請見 [`docs/COSTCO_ONSITE_HANDOVER.md`](docs/COSTCO_ONSITE_HANDOVER.md)。

- 2026-09-01 已驗證 Drive 共有 150 個檔案（149 張 HEIC 相片、1 支 MOV 影片）。
- 後台 `/admin/onsite` 的 Drive Sync 使用完整 pagination，將 HEIC 與 MOV 全部寫入私人 Supabase Queue。
- 後台分批處理 HEIC（轉 JPEG）與 MOV（最多擷取 6 張 Key Frames）；衍生檔只存於私有 Supabase Storage。
- Vision 辨識 → 商品/價牌配對後，人工於 `/admin/onsite` 回看原圖審核配對（VERIFIED／REJECTED，`POST /api/admin/onsite/pairings/review`），再由「已確認配對 → 產生特價草稿」批次寫入 `weekly_store_deals`（`id=onsite-<商品照ID>`，draft／UNVERIFIED）與 `costco_price_observations`（`id=obs-<價牌照ID>`，verified=false），並以 JAN 比對 Product Master（`products`）自動補 `product_id`。草稿於同頁補中文譯名／價格／期限後發布（`POST /api/admin/onsite/deals/update`，發布需中文譯名、已發布不可再改）。照片以私有 bucket 路徑儲存，前台 `/costco/deals` 讀取時轉 signed URL。
- 驗收數字報告（交接文件規定的實際數字，不用模糊百分比）：`/admin/onsite` 底部「驗收數字報告」區塊與 `GET /api/admin/onsite/report`（JSON 匯出），含檔案結算恆等式檢查：`Drive 總數 = 成功辨識 + 情境照 + 無法辨識 + 待處理`。
- 部署前須套用 `20260901` 與 `20260907` migrations（含 Agent 5 排程欄位），並設定 `SUPABASE_SERVICE_ROLE_KEY` 與 `GOOGLE_DRIVE_API_KEY`（或 `GOOGLE_DRIVE_ACCESS_TOKEN`）。
- Drive File ID、原始檔案連結與處理清冊不提交到公開 GitHub。
