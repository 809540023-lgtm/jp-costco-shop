-- Costco 原始 Drive 檔案與處理狀態僅供 service role / 後台使用。
alter table if exists public.costco_photo_processing_queue enable row level security;

-- 不建立 anon/authenticated policy；service_role 仍可完整存取。
