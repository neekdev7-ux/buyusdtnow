import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { checkOrderPayment, expireStaleOrders } from '@/lib/orders';

export const dynamic = 'force-dynamic';

// GET/POST /api/cron/check-payments — Vercel Cron (once daily, see vercel.json).
// Checks every AWAITING_PAYMENT / TRX_RECEIVED order against TronGrid and
// expires stale ones. Protected by CRON_SECRET when set:
//   Authorization: Bearer <CRON_SECRET>
// Vercel Cron requests carry no secret by default — set CRON_SECRET and add
// the header in vercel.json is not possible for crons, so the route also
// accepts the secret as ?secret= when CRON_SECRET is set. Keep it random.
export async function GET(req: NextRequest) {
  return runCron(req);
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

async function runCron(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    const querySecret = req.nextUrl.searchParams.get('secret') || '';
    if (auth !== `Bearer ${secret}` && querySecret !== secret) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
  }
  const settings = await getSettings();
  const expired = await expireStaleOrders();
  const { data } = await db()
    .from('orders')
    .select('*')
    .in('status', ['AWAITING_PAYMENT', 'TRX_RECEIVED'])
    .order('created_at', { ascending: true })
    .limit(50);
  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const order of (data || []) as Array<Record<string, unknown>>) {
    try {
      const r = await checkOrderPayment(order as never, settings);
      results.push({ id: String(order.id), status: r.status });
    } catch (err) {
      results.push({ id: String(order.id), status: String(order.status), error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ checked: results.length, expired, results });
}
