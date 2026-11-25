import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { updateOrder } from '@/lib/orders';

export const dynamic = 'force-dynamic';

// GET /api/orders/[id] — fetch one order (public fields only; no secrets stored).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  const { data, error } = await db().from('orders').select('*').eq('id', params.id).single();
  if (error || !data) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  // Auto-expire on read if past expiry and still awaiting payment.
  if (data.status === 'AWAITING_PAYMENT' && new Date(data.expires_at).getTime() <= Date.now()) {
    await updateOrder(params.id, { status: 'EXPIRED' });
    data.status = 'EXPIRED';
  }
  return NextResponse.json({ order: data });
}
