import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { validateSettings } from '@/lib/settings-validate';
import type { SettingsValues } from '@/lib/settings-validate';
import { verifyAdminToken } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Admin responses are explicitly no-store: the admin panel must always show
// the live data, never a cached copy.
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function unauthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return !verifyAdminToken(token);
}

const SETTING_KEYS: Record<string, string> = {
  trxRate: 'trx_rate',
  minBuyUsdt: 'min_buy_usdt',
  maxBuyUsdt: 'max_buy_usdt',
  expiryMinutes: 'expiry_minutes',
  trxPaymentAddress: 'trx_payment_address',
  usdtHotWalletAddress: 'usdt_hot_wallet_address',
  supportUsername: 'support_username',
  autoSendUsdt: 'auto_send_usdt',
  maxAutoSendUsdt: 'max_auto_send_usdt',
};

interface RateHistoryRow {
  id: string;
  old_rate: number;
  new_rate: number;
  created_at: string;
}

/**
 * Rate history is optional: if the `rate_history` table was never created
 * (migration not run), return [] instead of failing the whole request.
 */
async function loadRateHistory(): Promise<RateHistoryRow[]> {
  try {
    const { data, error } = await db()
      .from('rate_history')
      .select('id, old_rate, new_rate, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !data) return [];
    return data as RateHistoryRow[];
  } catch {
    return [];
  }
}

// GET /api/admin/settings — full settings (admin only; still no private keys)
// + rate history (empty array when the migration has not been run yet).
export async function GET(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: NO_STORE });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500, headers: NO_STORE });
  }
  const settings = await getSettings();
  const rateHistory = await loadRateHistory();
  return NextResponse.json({ settings, rateHistory }, { headers: NO_STORE });
}

// POST /api/admin/settings — { settings: {...} } — upserts into settings table.
// Validates the MERGED settings (current + edits) so a partial update can
// never leave an invalid combination (e.g. max below the current min).
// A rate change is logged to rate_history (best-effort: ignored when the
// table does not exist yet).
export async function POST(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const incoming = (body.settings || {}) as Record<string, unknown>;
  const current = await getSettings();
  const merged: SettingsValues = { ...current };
  const rows: Array<{ key: string; value: string }> = [];
  for (const [field, dbKey] of Object.entries(SETTING_KEYS)) {
    if (incoming[field] === undefined) continue;
    const v = incoming[field];
    if (typeof v === 'number' && !Number.isFinite(v)) {
      return NextResponse.json({ error: `Invalid value for ${field}.` }, { status: 400 });
    }
    (merged as unknown as Record<string, unknown>)[field] = v;
    rows.push({ key: dbKey, value: String(v) });
  }
  const check = validateSettings(merged);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const oldRate = current.trxRate;
  const savedAt = new Date().toISOString();
  for (const row of rows) {
    // updated_at is stamped on every save so /api/config can report when the
    // settings were last changed (freshness signal for the home page).
    const { error } = await db().from('settings').upsert({ ...row, updated_at: savedAt }, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Log a rate change (old → new). Best-effort: the table only exists after
  // the admin runs supabase-migration-rate-history.sql; a missing table
  // must never fail a settings save.
  if (merged.trxRate !== oldRate) {
    try {
      await db().from('rate_history').insert({ old_rate: oldRate, new_rate: merged.trxRate });
    } catch {
      // Table missing — history simply stays empty.
    }
  }
  const settings = await getSettings();
  const rateHistory = await loadRateHistory();
  return NextResponse.json({ settings, saved: rows.length, rateHistory }, { headers: NO_STORE });
}
