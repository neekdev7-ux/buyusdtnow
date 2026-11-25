import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { checkOrderPayment } from '@/lib/orders';

export const dynamic = 'force-dynamic';

// POST /api/orders/[id]/check — poll TronGrid for this order's TRX payment.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  const { data: order, error } = await db().from('orders').select('*').eq('id', params.id).single();
  if (error || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  const settings = await getSettings();
  try {
    const result = await checkOrderPayment(order, settings);
    const { data: updated } = await db().from('orders').select('*').eq('id', params.id).single();
    return NextResponse.json({ order: updated || order, check: result });
  } catch (err) {
    return NextResponse.json(
      { error: `Payment check failed: ${err instanceof Error ? err.message : String(err)}`, order },
      { status: 502 },
    );
  }
}
