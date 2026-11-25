-- TRX → USDT Exchange — Supabase schema
-- Run this in Supabase SQL Editor (once). Safe to re-run: uses IF NOT EXISTS.

create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null,
  telegram_username text,
  usdt_amount numeric(18, 2) not null,
  trx_rate numeric(18, 6) not null,
  trx_amount numeric(18, 6) not null,
  trx_amount_sun bigint not null,
  receive_address text not null,
  payment_address text not null,
  status text not null default 'AWAITING_PAYMENT',
  trx_txid text,
  trx_from text,
  confirmations int not null default 0,
  usdt_txid text,
  notes text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_telegram_id on orders (telegram_id);
create index if not exists idx_orders_status on orders (status);
create index if not exists idx_orders_expires_at on orders (expires_at);
create index if not exists idx_orders_created_at on orders (created_at desc);

-- Default settings (admin can change these in /admin afterwards).
insert into settings (key, value) values
  ('trx_rate', '3.50'),
  ('min_buy_usdt', '1000'),
  ('max_buy_usdt', '100000'),
  ('expiry_minutes', '30'),
  ('support_username', 'YourSupport')
on conflict (key) do nothing;

-- NOTE: trx_payment_address and usdt_hot_wallet_address are read from env
-- (TRX_PAYMENT_ADDRESS / USDT_HOT_WALLET_ADDRESS) unless overridden here.
-- Do NOT store private keys in this table, ever.

-- Referrals (telegram_mini_app skill):
--   link: t.me/<bot>/<app>?startapp=ref_<TELEGRAM_ID>
--   pending_referrals: bot-level /start ref_CODE fallback, attached on first app open.
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_telegram_id text not null,
  referred_telegram_id text not null unique,
  source text not null default 'startapp',
  created_at timestamptz not null default now()
);
create index if not exists idx_referrals_referrer on referrals (referrer_telegram_id);

create table if not exists pending_referrals (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null,
  referrer_telegram_id text not null,
  code text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pending_referrals_telegram on pending_referrals (telegram_id);

-- Support messages: user <-> admin. direction = 'user' | 'admin'.
create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null,
  telegram_username text,
  direction text not null default 'user',
  message text not null,
  replied boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_telegram on support_messages (telegram_id);
create index if not exists idx_support_created on support_messages (created_at desc);
