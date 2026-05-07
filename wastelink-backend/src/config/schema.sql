-- ============================================================
-- WasteLink Database Schema
-- Run this in Supabase SQL Editor or via migrate.js
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";         -- for geospatial queries

-- ── Enums ────────────────────────────────────────────────────
create type user_role       as enum ('seller', 'recycler', 'admin');
create type listing_status  as enum ('draft', 'pending_verification', 'verified', 'matched', 'collected', 'completed', 'cancelled');
create type transaction_status as enum ('initiated', 'pending', 'confirmed', 'completed', 'disputed', 'cancelled');
create type waste_condition as enum ('clean', 'mixed', 'contaminated');
create type notification_type as enum ('match_found', 'listing_verified', 'transaction_update', 'price_alert', 'system');

-- ── Users (extends Supabase auth.users) ─────────────────────
create table public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text unique not null,
  full_name       text not null,
  phone           text,
  role            user_role not null default 'seller',
  avatar_url      text,
  location        text,
  lat             double precision,
  lng             double precision,
  is_verified     boolean default false,
  is_active       boolean default true,
  rating          numeric(3,2) default 0.00,
  rating_count    integer default 0,
  metadata        jsonb default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Waste Listings ────────────────────────────────────────────
create table public.listings (
  id              uuid primary key default uuid_generate_v4(),
  seller_id       uuid not null references public.users(id) on delete cascade,
  waste_type      text not null,
  subtype         text not null,
  quantity_kg     numeric(10,2) not null check (quantity_kg > 0),
  condition       waste_condition not null default 'clean',
  description     text,
  status          listing_status not null default 'draft',
  location        text,
  lat             double precision,
  lng             double precision,

  -- Vision module outputs (populated by CV service)
  vision_confidence   numeric(5,2),
  vision_quality      numeric(5,2),
  vision_consistency  numeric(5,2),
  vision_verdict      text,
  vision_notes        text,

  -- Pricing (populated by ML service)
  price_per_kg        numeric(10,2),
  base_price          numeric(10,2),
  quality_adjustment  numeric(10,2),
  volume_adjustment   numeric(10,2),
  final_price         numeric(10,2),
  price_accepted      boolean default false,
  price_accepted_at   timestamptz,

  expires_at      timestamptz default now() + interval '30 days',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Listing Images ────────────────────────────────────────────
create table public.listing_images (
  id          uuid primary key default uuid_generate_v4(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  url         text not null,
  storage_path text not null,
  is_primary  boolean default false,
  created_at  timestamptz default now()
);

-- ── Recycler Profiles (extra info for recycler-role users) ───
create table public.recycler_profiles (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid unique not null references public.users(id) on delete cascade,
  business_name   text not null,
  license_number  text,
  accepted_types  text[] not null default '{}',
  operating_hours jsonb default '{}',
  max_capacity_kg numeric(10,2),
  is_certified    boolean default false,
  certification_url text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Matches ───────────────────────────────────────────────────
create table public.matches (
  id            uuid primary key default uuid_generate_v4(),
  listing_id    uuid not null references public.listings(id) on delete cascade,
  recycler_id   uuid not null references public.users(id) on delete cascade,
  seller_id     uuid not null references public.users(id) on delete cascade,
  status        text not null default 'proposed'
                  check (status in ('proposed','accepted','rejected','expired')),
  distance_km   numeric(6,2),
  message       text,
  responded_at  timestamptz,
  created_at    timestamptz default now(),
  unique(listing_id, recycler_id)
);

-- ── Transactions ──────────────────────────────────────────────
create table public.transactions (
  id              uuid primary key default uuid_generate_v4(),
  listing_id      uuid not null references public.listings(id),
  match_id        uuid references public.matches(id),
  seller_id       uuid not null references public.users(id),
  recycler_id     uuid not null references public.users(id),
  waste_type      text not null,
  quantity_kg     numeric(10,2) not null,
  price_per_kg    numeric(10,2) not null,
  total_amount    numeric(12,2) not null,
  currency        text default 'KES',
  status          transaction_status not null default 'initiated',
  payment_method  text,
  payment_ref     text,
  collected_at    timestamptz,
  completed_at    timestamptz,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Ratings ───────────────────────────────────────────────────
create table public.ratings (
  id            uuid primary key default uuid_generate_v4(),
  transaction_id uuid not null references public.transactions(id),
  rater_id      uuid not null references public.users(id),
  ratee_id      uuid not null references public.users(id),
  score         integer not null check (score between 1 and 5),
  comment       text,
  created_at    timestamptz default now(),
  unique(transaction_id, rater_id)
);

-- ── Notifications ─────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        notification_type not null,
  title       text not null,
  body        text not null,
  data        jsonb default '{}',
  is_read     boolean default false,
  created_at  timestamptz default now()
);

-- ── Admin Audit Log ───────────────────────────────────────────
create table public.audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  actor_id    uuid references public.users(id),
  action      text not null,
  resource    text not null,
  resource_id uuid,
  old_data    jsonb,
  new_data    jsonb,
  ip_address  text,
  created_at  timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────
create index idx_listings_seller      on public.listings(seller_id);
create index idx_listings_status      on public.listings(status);
create index idx_listings_waste_type  on public.listings(waste_type);
create index idx_listings_created     on public.listings(created_at desc);
create index idx_transactions_seller  on public.transactions(seller_id);
create index idx_transactions_recycler on public.transactions(recycler_id);
create index idx_transactions_status  on public.transactions(status);
create index idx_notifications_user   on public.notifications(user_id, is_read);
create index idx_matches_listing      on public.matches(listing_id);
create index idx_matches_recycler     on public.matches(recycler_id);

-- ── updated_at trigger ────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_users_updated        before update on public.users        for each row execute function set_updated_at();
create trigger trg_listings_updated     before update on public.listings     for each row execute function set_updated_at();
create trigger trg_transactions_updated before update on public.transactions for each row execute function set_updated_at();
create trigger trg_recycler_updated     before update on public.recycler_profiles for each row execute function set_updated_at();

-- ── Rating denormalization trigger ───────────────────────────
create or replace function public.update_user_rating()
returns trigger language plpgsql as $$
begin
  update public.users
  set
    rating       = (select avg(score) from public.ratings where ratee_id = new.ratee_id),
    rating_count = (select count(*)  from public.ratings where ratee_id = new.ratee_id)
  where id = new.ratee_id;
  return new;
end; $$;

create trigger trg_rating_update after insert on public.ratings
  for each row execute function update_user_rating();

-- ── Row Level Security ────────────────────────────────────────
alter table public.users              enable row level security;
alter table public.listings           enable row level security;
alter table public.listing_images     enable row level security;
alter table public.recycler_profiles  enable row level security;
alter table public.matches            enable row level security;
alter table public.transactions       enable row level security;
alter table public.ratings            enable row level security;
alter table public.notifications      enable row level security;

-- Users: read own, admin reads all
create policy "users_select_own"   on public.users for select using (auth.uid() = id);
create policy "users_update_own"   on public.users for update using (auth.uid() = id);

-- Listings: sellers own theirs, recyclers & sellers read verified
create policy "listings_select_public" on public.listings for select
  using (status not in ('draft') or seller_id = auth.uid());
create policy "listings_insert_seller" on public.listings for insert
  with check (auth.uid() = seller_id);
create policy "listings_update_seller" on public.listings for update
  using (auth.uid() = seller_id);

-- Notifications: own only
create policy "notif_own" on public.notifications for all using (auth.uid() = user_id);

-- Transactions: parties only
create policy "tx_parties" on public.transactions for select
  using (auth.uid() = seller_id or auth.uid() = recycler_id);
