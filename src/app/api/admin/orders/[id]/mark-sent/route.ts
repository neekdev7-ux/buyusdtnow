import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/admin';
import { updateOrder } from '@/lib/orders';
import { notifyAdmin } from '@/lib/notify';

export const dynamic = 'force-dynamic';

function unauthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return !verifyAdminToken(token);
}

// POST /api/admin/orders/[id]/mark-sent — { usdtTxid } — admin confirms the
// manual USDT payout was sent; order becomes COMPLETED.
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
  const usdtTxid = String(body.usdtTxid || '').trim();
  if (!usdtTxid) return NextResponse.json({ error: 'usdtTxid is required.' }, { status: 400 });

  const { data: order, error } = await db().from('orders').select('*').eq('id', params.id).single();
  if (error || !order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.status !== 'TRX_CONFIRMED' && order.status !== 'USDT_SENDING') {
    return NextResponse.json(
      { error: `Order is ${order.status} — only TRX_CONFIRMED / USDT_SENDING orders can be marked sent.` },
      { status: 400 },
    );
  }
  await updateOrder(params.id, { status: 'COMPLETED', usdt_txid: usdtTxid });
  const { data: updated } = await db().from('orders').select('*').eq('id', params.id).single();
  void notifyAdmin(
    `✅ Order completed (manual payout)\nOrder ${params.id}\n${Number(order.usdt_amount).toLocaleString()} USDT sent to ${order.receive_address}\nUSDT TX: ${usdtTxid}`,
  );
  return NextResponse.json({ order: updated });
}
