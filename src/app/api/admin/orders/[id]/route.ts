import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/admin';
import { canDeleteOrder } from '@/lib/settings-validate';

export const dynamic = 'force-dynamic';

function unauthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return !verifyAdminToken(token);
}

// DELETE /api/admin/orders/[id] — admin housekeeping delete.
// Only expired / failed (incl. admin-rejected) orders may be deleted.
// Paid, confirmed or completed orders are the payout record and can
// NEVER be deleted through this endpoint.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (unauthorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  const { data: order, error } = await db().from('orders').select('id, status').eq('id', params.id).single();
  if (error || !order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (!canDeleteOrder(order.status)) {
    return NextResponse.json(
      { error: `Only expired or failed orders can be deleted (this order is ${order.status}). Paid / completed orders are never deleted.` },
      { status: 400 },
    );
  }
  const { error: delError } = await db().from('orders').delete().eq('id', params.id);
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
  return NextResponse.json({ deleted: true, id: params.id });
}
