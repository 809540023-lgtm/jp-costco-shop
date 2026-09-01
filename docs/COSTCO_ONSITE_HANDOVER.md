# 日本 Costco 現場照片系統交接與執行基準

本專案是既有系統延伸，不可從零重做。原始資料來源為：

- GitHub：`809540023-lgtm/jp-costco-shop`（`main`）
- Google Drive：`1_Ryc7z4Et-M5lRA0q96gIUfYPDX8TelB`
- 2026-09-01 實際盤點：150 個檔案，149 張 HEIC、1 支 MOV，共 421,333,179 bytes

## 三種商品來源必須分開

1. Costco 現場商品：現場商品照、價牌、價格、促銷證據、規格與平均單價。
2. 日本 Costco 熱門 Top 50：每日搜尋、待審核後發布。
3. 現場直播商品：保留既有 `/costco/live` 模組。

## 正式處理流程

Google Drive 完整清冊 → `costco_photo_processing_queue` → HEIC 轉 JPEG／MOV 抽幀 → Vision 商品與價牌辨識 → 商品/價牌配對 → Product Master → `weekly_store_deals` → `costco_price_observations` → 人工確認 → `/costco/deals` 發布。

Drive 檔案以 `drive_file_id` 作唯一鍵。每個檔案最終必須是 `COMPLETED`、`DUPLICATE`、`CONTEXT_ONLY`、`NEEDS_REVIEW` 或 `FAILED` 之一，並滿足：

`Drive Total Files = COMPLETED + DUPLICATE + CONTEXT_ONLY + NEEDS_REVIEW + FAILED`

## 配對與價格規則

- 不可只靠檔名連號配對；依 Costco Item Number、JAN、品牌、名稱、規格、價牌文字、視覺相似度與拍攝時間綜合判斷。
- 只看到單一價格不得判定為特價。
- 只有價牌出現通常価格、OFF、値引、割引、期限、SALE 或 SPECIAL PRICE 等證據，才能填原價、折扣、特價與期限。
- 舊聊天辨識結果全部視為 Candidate Data，須回看原圖後才能標記 `VERIFIED`。

## 跨境篩選

優先日本製、日本限定、特殊規格、季節限定、小體積、輕量、常溫、高單價密度商品。不優先紙品、瓶裝水、整箱飲料、大型清潔品、尿布、大型家電家具。食品、保健食品、化妝品、藥品、醫療器材、液體與鋰電池必須加上法規風險，不得因熱門自動發布。

## 驗收數字

最終報告必須列出 Drive 總檔案數、圖片數、影片數、下載/轉檔/Vision 成功數、重複、情境照、無法辨識、Needs Review、唯一商品、商品價牌成功配對、只有商品無價格、一般價格、限時特價與已發布數；不得使用模糊百分比。
