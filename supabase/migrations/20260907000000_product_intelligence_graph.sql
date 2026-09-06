-- =====================================================================
-- JP Costco Shop 3.0 — Product Intelligence Graph v1（Phase 9）
-- 依 ~/JP-Costco-3.0-SPEC/graph-schema.sql 落地；與 2.0 既有表並存。
-- 設計原則：不覆蓋既有功能；所有新表啟用 RLS（service_role 可完整存取，
-- anon 無 policy → 對外不可讀），評分一律存 score_snapshot 可追溯。
-- =====================================================================

-- 1. product_entity — 商品實體主檔（跨來源比對後的唯一商品）
create table if not exists public.product_entity (
  id                uuid primary key default gen_random_uuid(),
  canonical_name    text not null,
  canonical_name_jp text,
  brand             text,
  category          text,
  keywords          text[] default '{}',
  status            text not null default 'candidate'
                    check (status in ('candidate','screened','observing',
                                      'listed','top50','weekly_pick',
                                      'hot_candidate','rejected')),
  first_seen_at     timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (canonical_name, brand)
);
alter table public.product_entity enable row level security;

-- 2. source_listing — 各來源原始觀測（雷達 Agent 的原始輸入）
create table if not exists public.source_listing (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid references public.product_entity(id),
  source_type    text not null check (source_type in
                   ('costco_jp_web','youtube','instagram','tiktok','blog',
                    'x_twitter','reseller_video','internal_video','tw_ec','manual')),
  external_id    text,
  url            text,
  title          text,
  author         text,
  author_key     text,
  published_at   timestamptz,
  raw_payload    jsonb,
  dedup_hash     text unique,
  fetched_at     timestamptz not null default now()
);
alter table public.source_listing enable row level security;
create index if not exists idx_source_listing_type
  on public.source_listing (source_type, fetched_at desc);

-- 3. reseller_mention — Reseller Promotion Signal
create table if not exists public.reseller_mention (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.product_entity(id),
  source_listing_id uuid references public.source_listing(id),
  reseller_key      text not null,
  platform          text not null,
  is_first_mention  boolean default false,
  engagement        jsonb,
  mentioned_at      timestamptz not null,
  created_at        timestamptz not null default now()
);
alter table public.reseller_mention enable row level security;
create index if not exists idx_reseller_mention_product
  on public.reseller_mention (product_id, mentioned_at desc);
create index if not exists idx_reseller_mention_recent
  on public.reseller_mention (mentioned_at desc);

-- 4. price_observation — 價格觀測（原幣別；匯率轉換集中在計算層）
create table if not exists public.price_observation (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.product_entity(id),
  market       text not null check (market in
                 ('costco_jp','costco_tw','tw_ec','daigou','other')),
  price        numeric not null,
  currency     text not null default 'JPY',
  unit_text    text,
  is_promo     boolean default false,
  observed_at  date not null default current_date,
  source_url   text
);
alter table public.price_observation enable row level security;
create index if not exists idx_price_obs_product
  on public.price_observation (product_id, market, observed_at desc);

-- 5. intent_signal — 消費者購買意圖原始事件
create table if not exists public.intent_signal (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid references public.product_entity(id),
  source_listing_id uuid references public.source_listing(id),
  platform          text,
  text_raw          text,
  intent_class      text not null check (intent_class in
                      ('want_buy','asking_price','asking_where','asking_daigou',
                       'positive_review','neutral','like_only','negative','exists_tw')),
  intent_weight     numeric not null default 0,
  classified_by     text not null default 'rule',
  created_at        timestamptz not null default now()
);
alter table public.intent_signal enable row level security;
create index if not exists idx_intent_product
  on public.intent_signal (product_id, created_at desc);

-- 6. logistics_profile — 物流／法規靜態屬性
create table if not exists public.logistics_profile (
  product_id        uuid primary key references public.product_entity(id),
  weight_g          integer,
  volume_cm3        integer,
  fragile           boolean default false,
  shelf_life_days   integer,
  needs_cold_chain  boolean default false,
  tw_import_ok      boolean default true,
  compliance_notes  text
);
alter table public.logistics_profile enable row level security;

-- 7. review_snapshot — 日本／台灣評價彙總
create table if not exists public.review_snapshot (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.product_entity(id),
  market        text not null check (market in ('jp','tw')),
  avg_rating    numeric,
  review_count  integer,
  notable_quotes jsonb default '[]',
  observed_at   date not null default current_date
);
alter table public.review_snapshot enable row level security;

-- 8. score_snapshot — 各 Agent 評分快照（可追溯的決策紀錄）
create table if not exists public.score_snapshot (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references public.product_entity(id),
  snapshot_date         date not null default current_date,
  reseller_signal_score numeric,
  intent_score          numeric,
  suitability_score     numeric,
  recommendation_score  numeric,
  decision              text check (decision in
                          ('reject','observe','list','top50',
                           'weekly_pick','hot_candidate')),
  reasons               jsonb,
  model_used            text,
  created_at            timestamptz not null default now(),
  unique (product_id, snapshot_date)
);
alter table public.score_snapshot enable row level security;
create index if not exists idx_score_snapshot_date
  on public.score_snapshot (snapshot_date desc, recommendation_score desc);

-- 9. content_draft — 自動營運 Agent 的內容產出（發布前草稿）
create table if not exists public.content_draft (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.product_entity(id),
  title_tw            text,
  description_tw      text,
  spec_text           text,
  selling_points      jsonb default '[]',
  seo                 jsonb,
  social_captions     jsonb,
  suggested_price_twd numeric,
  unit_price_twd      numeric,
  promo_text          text,
  publish_status      text not null default 'draft'
                      check (publish_status in ('draft','approved','published')),
  published_product_id uuid,
  created_at          timestamptz not null default now()
);
alter table public.content_draft enable row level security;

-- 10. 訂單擴充（Agent 6）— 對照 2.0 實際 public.orders 表；僅新增欄位，冪等
alter table public.orders add column if not exists shipping_fee_status text default 'pending';
alter table public.orders add column if not exists estimated_cost_jpy  numeric;
alter table public.orders add column if not exists purchase_list_id    uuid;
alter table public.orders add column if not exists tracking_number     text;
alter table public.orders add column if not exists tracking_status     text default 'none';

-- 11. 採購主管 Dashboard — 今日漏斗視圖
create or replace view public.v_dashboard_funnel as
with today_scores as (
  select distinct on (product_id)
         product_id, recommendation_score, decision
  from   public.score_snapshot
  order  by product_id, snapshot_date desc
)
select
  (select count(*) from public.product_entity
    where first_seen_at::date = current_date)                        as new_products_today,
  (select count(*) from today_scores
    where recommendation_score >= 60)                                as passed_first_round,
  (select count(*) from today_scores where decision = 'weekly_pick') as suggested_this_week,
  (select count(*) from today_scores where decision = 'hot_candidate') as hot_candidates,
  (select count(*) from today_scores where decision = 'reject')      as rejected_today,
  (select count(*) from public.source_listing
    where source_type = 'costco_jp_web'
      and fetched_at::date = current_date
      and raw_payload->>'is_promo' = 'true')                          as new_costco_promos;

-- 12. 漏斗彙總視圖（門檻為建議值，調整請改 lib/graph/config.ts 並同步此視圖）
create or replace view public.v_funnel_counts as
select
  count(*) filter (where true)                                     as total_entities,
  count(*) filter (where suitability_score >= 40)                  as candidates,
  count(*) filter (where intent_score >= 50)                       as tw_demand,
  count(*) filter (where suitability_score >= 65
                   and intent_score >= 50)                         as fit_daigou,
  count(*) filter (where recommendation_score >= 70)               as worth_list,
  count(*) filter (where decision = 'weekly_pick')                 as weekly_picks
from public.score_snapshot s
where s.snapshot_date = current_date;