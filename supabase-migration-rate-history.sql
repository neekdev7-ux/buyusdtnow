-- TRX → USDT Exchange — rate history migration (optional, safe to re-run)
-- Run this in Supabase SQL Editor ONCE, after the main supabase-schema.sql.
-- It adds the `rate_history` table used by /admin → "Rate history"
-- (every rate change is logged old → new with a timestamp).
--
-- The app works WITHOUT this table: if it does not exist, the Rate history
-- list simply stays empty and saving settings still works (the code guards
-- every rate_history access). Run this only to enable the history view.

create table if not exists rate_history (
  id uuid primary key default gen_random_uuid(),
  old_rate numeric(18, 6) not null,
  new_rate numeric(18, 6) not null,
  changed_by text not null default 'admin',
  created_at timestamptz not null default now()
);
create index if not exists idx_rate_history_created on rate_history (created_at desc);
