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

## 技術
- Next.js + TypeScript + Tailwind CSS
- SQLite（node:sqlite，同步、免編譯）
- Zod 表單驗證
- 手機優先、RWD、適合 LINE 內建瀏覽器

## 常用指令
```bash
npm run dev        # 開發
npm run build      # 建置
npm run db:init    # 初始化資料庫
npm run seed       # 加入測試資料
npm run search:run # 手動執行每日搜尋
npm test           # 執行測試
```

## 敏感資料
- 不把 API Token、LINE token、身分證字號寫入程式碼或 commit。
- 使用環境變數（`.env`，且加入 `.gitignore`）。

## 完成工作
1. 執行 `npm test` 與 `npm run build`。
2. 更新 `README.md` 與本檔。
3. 以 `copilot:` 前綴 commit。
