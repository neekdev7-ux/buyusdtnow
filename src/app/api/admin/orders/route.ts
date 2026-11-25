import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
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

// GET /api/admin/orders — all orders (newest first) + stats.
export async function GET(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: NO_STORE });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500, headers: NO_STORE });
  }
  const { data, error } = await db()
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  const orders = (data || []) as Array<Record<string, unknown>>;
  const completed = orders.filter((o) => o.status === 'COMPLETED');
  const stats = {
    totalVolumeUsdt: completed.reduce((s, o) => s + Number(o.usdt_amount || 0), 0),
    pendingPayouts: orders.filter((o) => o.status === 'TRX_CONFIRMED').length,
    completed: completed.length,
    awaiting: orders.filter((o) => o.status === 'AWAITING_PAYMENT').length,
    txidSubmitted: orders.filter((o) => o.status === 'TXID_SUBMITTED').length,
  };
  return NextResponse.json({ orders, stats }, { headers: NO_STORE });
}
