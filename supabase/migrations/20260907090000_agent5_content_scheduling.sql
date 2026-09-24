-- Agent 5 自動營運：內容草稿排程欄位（冪等；僅新增欄位，不覆蓋既有表）
alter table public.content_draft add column if not exists scheduled_for timestamptz;
alter table public.content_draft add column if not exists approved_at timestamptz;

create index if not exists idx_content_draft_schedule
  on public.content_draft (publish_status, scheduled_for);