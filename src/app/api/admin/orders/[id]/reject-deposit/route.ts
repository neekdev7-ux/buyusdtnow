import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/admin';
import { updateOrder } from '@/lib/orders';
import { sendTelegramMessage } from '@/lib/notify';

export const dynamic = 'force-dynamic';

function unauthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return !verifyAdminToken(token);
}

// POST /api/admin/orders/[id]/reject-deposit — { reason } — admin rejects a
// TXID_SUBMITTED order (wrong TXID / wrong amount / not found on-chain).
// Order becomes FAILED with the reason stored, and the user is DM'd to
// contact support with the correct TXID.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
  const reason = String(body.reason || '').trim();
  if (!reason) return NextResponse.json({ error: 'reason is required.' }, { status: 400 });

  const { data: order, error } = await db().from('orders').select('*').eq('id', params.id).single();
  if (error || !order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.status !== 'TXID_SUBMITTED') {
    return NextResponse.json(
      { error: `Order is ${order.status} — only TXID_SUBMITTED orders can be rejected this way.` },
      { status: 409 },
    );
  }
  await updateOrder(params.id, { status: 'FAILED', admin_review_note: reason, notes: reason });
  const { data: updated } = await db().from('orders').select('*').eq('id', params.id).single();

  void sendTelegramMessage(
    order.telegram_id,
    `❌ Deposit rejected\nOrder ${params.id}\nReason: ${reason}\nPlease contact support with the correct TRX TXID for your payment of ${Number(order.trx_amount).toLocaleString()} TRX.`,
  );

  return NextResponse.json({ order: updated });
}
