import { db } from './supabase';

/**
 * App users — every Telegram user who opens the app or places an order.
 * Previously users existed only implicitly inside orders / support_messages,
 * so the admin panel had no user list at all: a user who only opened the
 * app never appeared anywhere. Rows are upserted best-effort (see
 * upsertUser) — a missing `users` table must never break order creation,
 * the webhook, or the buy flow.
 */
export interface AppUser {
  telegram_id: string;
  telegram_username: string | null;
  first_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  order_count?: number;
  total_usdt?: number;
}

/**
 * Record (or refresh) a Telegram user. Never throws: any DB failure
 * (table not created yet, network error, …) is swallowed — callers must
 * not fail just because user tracking is unavailable.
 * first_seen_at is only set on insert (it defaults to now() in the table);
 * the upsert row omits it so an existing row keeps its original first_seen.
 */
export async function upsertUser(
  telegramId: string,
  telegramUsername?: string | null,
  firstName?: string | null,
): Promise<void> {
  if (!telegramId) return;
  try {
    const { error } = await db()
      .from('users')
      .upsert(
        {
          telegram_id: String(telegramId),
          telegram_username: telegramUsername || null,
          first_name: firstName || null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'telegram_id' },
      );
    if (error) {
      console.warn('[users] upsert failed (non-fatal):', error.message);
    }
  } catch (err) {
    console.warn('[users] upsert failed (non-fatal):', err instanceof Error ? err.message : String(err));
  }
}

/**
 * All users (newest activity first) with their order counts and total USDT
 * ordered. Returns [] when the `users` table does not exist yet.
 */
export async function listUsers(): Promise<AppUser[]> {
  try {
    const { data, error } = await db()
      .from('users')
      .select('telegram_id, telegram_username, first_name, first_seen_at, last_seen_at')
      .order('last_seen_at', { ascending: false })
      .limit(200);
    if (error || !data) {
      if (error) console.warn('[users] list failed:', error.message);
      return [];
    }
    const users = data as AppUser[];
    // Order totals per user (one extra query, tallied in JS).
    const { data: orders } = await db().from('orders').select('telegram_id, usdt_amount');
    const totals = new Map<string, { count: number; total: number }>();
    for (const o of (orders || []) as Array<{ telegram_id: string; usdt_amount: number | string }>) {
      const t = totals.get(o.telegram_id) || { count: 0, total: 0 };
      t.count += 1;
      t.total += Number(o.usdt_amount || 0);
      totals.set(o.telegram_id, t);
    }
    return users.map((u) => {
      const t = totals.get(u.telegram_id) || { count: 0, total: 0 };
      return { ...u, order_count: t.count, total_usdt: t.total };
    });
  } catch (err) {
    console.warn('[users] list failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}
