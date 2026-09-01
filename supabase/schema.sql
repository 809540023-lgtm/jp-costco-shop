-- JP Costco 購物系統資料庫結構（PostgreSQL / Supabase）
-- 在 Supabase 的 SQL Editor 中執行一次即可。

-- 商品
create table if not exists public.products (
  id text primary key,
  jp_name text not null,
  zh_name text,
  english_name text,
  brand text,
  category text,
  spec text,
  description text,
  summary text,
  features text,
  jan_code text,
  costco_url text,
  image_url text,
  jp_price numeric,
  discount_price numeric,
  price_confirmed_at timestamptz,
  in_stock boolean default false,
  is_hot_buy boolean default false,
  is_new boolean default false,
  rating numeric,
  review_count integer default 0,
  evidence_source text,
  evidence_type text,
  japan_exclusive_note text,
  taiwan_demand text,
  taiwan_suggested_price numeric,
  logistics_cost numeric,
  landed_cost numeric,
  regulation_risk text,
  suitable_for_import boolean default true,
  procurement_note text,
  status text default 'draft',
  score numeric default 0,
  search_batch_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 商品來源
create table if not exists public.product_sources (
  id bigserial primary key,
  product_id text not null references public.products(id),
  source_type text not null,
  source_url text,
  source_title text,
  evidence text,
  captured_at timestamptz default now()
);

-- 其他通路價格比較
create table if not exists public.comparison_prices (
  id bigserial primary key,
  product_id text not null references public.products(id),
  source text not null,
  source_name text,
  price numeric,
  currency text default 'JPY',
  captured_at timestamptz default now()
);

-- 搜尋批次
create table if not exists public.search_batches (
  id text primary key,
  search_date text not null,
  status text default 'running',
  summary text,
  product_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 商品排名
create table if not exists public.product_rankings (
  id bigserial primary key,
  product_id text not null references public.products(id),
  search_batch_id text not null references public.search_batches(id),
  rank integer,
  score numeric,
  score_breakdown text,
  created_at timestamptz default now()
);

-- 已發布商品集合
create table if not exists public.published_collections (
  id text primary key,
  title text,
  status text default 'published',
  published_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.published_collection_items (
  id bigserial primary key,
  collection_id text not null references public.published_collections(id),
  product_id text not null references public.products(id),
  rank integer
);

-- 訂單
create table if not exists public.orders (
  id text primary key,
  order_number text unique not null,
  status text default 'pending',
  product_total numeric default 0,
  shipping_fee numeric default 0,
  customs_fee numeric default 0,
  total_amount numeric default 0,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 訂單明細
create table if not exists public.order_items (
  id bigserial primary key,
  order_id text not null references public.orders(id),
  product_id text not null,
  product_name text not null,
  unit_price numeric not null,
  quantity integer not null,
  subtotal numeric not null,
  image_url text
);

-- 客戶資料
create table if not exists public.customer_profiles (
  id bigserial primary key,
  order_id text not null references public.orders(id),
  name text not null,
  phone text not null,
  email text,
  address text not null,
  postal_code text,
  delivery_method text,
  note text,
  created_at timestamptz default now()
);

-- 報關資料
create table if not exists public.customs_profiles (
  id bigserial primary key,
  order_id text not null references public.orders(id),
  zh_name text not null,
  id_number text not null,
  phone text not null,
  email text,
  ezway_phone text,
  consent boolean default false,
  created_at timestamptz default now()
);

-- 通知
create table if not exists public.notifications (
  id bigserial primary key,
  type text not null,
  channel text default 'line',
  recipient text,
  title text,
  body text,
  status text default 'pending',
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- 稽核紀錄
create table if not exists public.audit_logs (
  id bigserial primary key,
  actor text,
  action text not null,
  entity_type text,
  entity_id text,
  detail text,
  created_at timestamptz default now()
);

create table if not exists public.costco_photo_processing_queue (
  id text primary key,
  drive_file_id text not null unique,
  drive_folder_id text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint,
  captured_at timestamptz,
  drive_modified_at timestamptz,
  download_status text default 'PENDING',
  conversion_status text default 'PENDING',
  vision_status text default 'PENDING',
  pairing_status text default 'PENDING',
  product_id text references public.products(id),
  deal_id text,
  confidence numeric,
  error_message text,
  retry_count integer default 0,
  processed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_photo_queue_status
  on public.costco_photo_processing_queue(vision_status, pairing_status);

alter table public.costco_photo_processing_queue enable row level security;

create table if not exists public.weekly_store_deals (
  id text primary key,
  product_id text references public.products(id),
  costco_item_number text,
  store_name text,
  store_location text,
  product_name_ja text not null,
  product_name_zh text,
  primary_photo_url text,
  price_tag_photo_url text,
  regular_price_jpy numeric,
  sale_price_jpy numeric,
  discount_jpy numeric,
  package_quantity numeric,
  package_unit text,
  net_weight text,
  unit_price numeric,
  unit_price_label text,
  sale_start_date date,
  sale_end_date date,
  captured_at timestamptz,
  captured_by text,
  ai_description text,
  ai_confidence numeric,
  verification_status text default 'UNVERIFIED',
  status text default 'draft',
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.costco_price_observations (
  id text primary key,
  product_id text references public.products(id),
  deal_id text references public.weekly_store_deals(id),
  photo_id text not null references public.costco_photo_processing_queue(id),
  store_name text,
  store_location text,
  observed_price numeric,
  regular_price numeric,
  discount_amount numeric,
  sale_start_date date,
  sale_end_date date,
  observed_at timestamptz,
  confidence numeric,
  verified boolean default false,
  created_at timestamptz default now()
);

-- 讓 anon 可讀取已發布商品與比較價格（購物網站前台不需登入）
alter table public.products enable row level security;
alter table public.comparison_prices enable row level security;
create policy "public read products" on public.products for select using (true);
create policy "public read comparison" on public.comparison_prices for select using (true);
