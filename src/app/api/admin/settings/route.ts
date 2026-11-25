import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { verifyAdminToken } from '@/lib/admin';

export const dynamic = 'force-dynamic';

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

// GET /api/admin/settings — full settings (admin only; still no private keys).
export async function GET(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

// POST /api/admin/settings — { settings: {...} } — upserts into settings table.
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
  const rows: Array<{ key: string; value: string }> = [];
  for (const [field, dbKey] of Object.entries(SETTING_KEYS)) {
    if (incoming[field] === undefined) continue;
    const v = incoming[field];
    if (typeof v === 'number' && !Number.isFinite(v)) {
      return NextResponse.json({ error: `Invalid value for ${field}.` }, { status: 400 });
    }
    rows.push({ key: dbKey, value: String(v) });
  }
  // Validate the important ones.
  const rate = rows.find((r) => r.key === 'trx_rate');
  if (rate && Number(rate.value) <= 0) return NextResponse.json({ error: 'Rate must be positive.' }, { status: 400 });
  const min = rows.find((r) => r.key === 'min_buy_usdt');
  if (min && Number(min.value) < 1) return NextResponse.json({ error: 'Min buy must be at least 1.' }, { status: 400 });

  for (const row of rows) {
    const { error } = await db().from('settings').upsert(row, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const settings = await getSettings();
  return NextResponse.json({ settings, saved: rows.length });
}
