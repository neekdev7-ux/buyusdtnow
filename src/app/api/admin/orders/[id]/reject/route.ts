import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/admin';
import { updateOrder } from '@/lib/orders';

export const dynamic = 'force-dynamic';

function unauthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return !verifyAdminToken(token);
}

// POST /api/admin/orders/[id]/reject — reject an unpaid / unconfirmed order.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (unauthorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  const { data: order, error } = await db().from('orders').select('*').eq('id', params.id).single();
  if (error || !order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Completed orders cannot be rejected.' }, { status: 400 });
  }
  await updateOrder(params.id, { status: 'FAILED', notes: 'Rejected by admin.' });
  const { data: updated } = await db().from('orders').select('*').eq('id', params.id).single();
  return NextResponse.json({ order: updated });
}
