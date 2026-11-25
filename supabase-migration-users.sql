-- TRX → USDT Exchange — users table migration
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run: uses IF NOT EXISTS.
-- Needed for the /admin Users list (new in the 2026-11-25 fix): without this
-- table the Users list simply stays empty — the app keeps working, orders
-- and support still work, user capture just has nowhere to write.

create table if not exists users (
  telegram_id text primary key,
  telegram_username text,
  first_name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_users_last_seen on users (last_seen_at desc);

-- Backfill from existing data so past buyers / support senders show up:
-- one row per telegram_id seen in orders or support_messages.
insert into users (telegram_id, telegram_username, first_seen_at, last_seen_at)
select telegram_id, max(telegram_username), min(created_at), max(created_at)
from (
  select telegram_id, telegram_username, created_at from orders
  union all
  select telegram_id, telegram_username, created_at from support_messages
) s
group by telegram_id
on conflict (telegram_id) do nothing;
