import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/admin';
import { getSettings } from '@/lib/settings';
import { handleConfirmedPayment } from '@/lib/orders';
import { verifyTrxTxOnTronGrid } from '@/lib/txid';
import { sendTelegramMessage } from '@/lib/notify';

export const dynamic = 'force-dynamic';

function unauthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return !verifyAdminToken(token);
}

// POST /api/admin/orders/[id]/confirm-deposit — admin verifies the
// user-submitted TXID on TronGrid and confirms the deposit. On success the
// shared handleConfirmedPayment path runs (TRX_CONFIRMED -> auto-send USDT
// if enabled, otherwise queued for manual payout) and the user is DM'd.
// On any verification failure the order status is NOT changed.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (unauthorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  const { data: order, error } = await db().from('orders').select('*').eq('id', params.id).single();
  if (error || !order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.status !== 'TXID_SUBMITTED') {
    return NextResponse.json(
      { error: `Order is ${order.status} — only TXID_SUBMITTED orders can be confirmed.` },
      { status: 409 },
    );
  }
  if (!order.trx_txid) {
    return NextResponse.json({ error: 'Order has no submitted TXID to verify.' }, { status: 409 });
  }

  let verification;
  try {
    verification = await verifyTrxTxOnTronGrid(order.trx_txid, order);
  } catch (err) {
    return NextResponse.json(
      { error: `Deposit verification failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
  if (!verification.ok) {
    return NextResponse.json(
      {
        error: `Deposit verification failed: ${verification.reason}.`,
        reason: verification.reason,
        detail: verification.detail || null,
      },
      { status: 422 },
    );
  }

  const settings = await getSettings();
  const result = await handleConfirmedPayment(
    order,
    settings,
    order.trx_txid,
    verification.fromHex,
    verification.confirmations,
  );

  void sendTelegramMessage(
    order.telegram_id,
    `✅ TRX deposit confirmed\nOrder ${params.id}\n${Number(order.usdt_amount).toLocaleString()} USDT ← ${Number(order.trx_amount).toLocaleString()} TRX received (${verification.confirmations} confirmations)\nYour USDT payout is next — it will be sent to ${order.receive_address}.`,
  );

  const { data: updated } = await db().from('orders').select('*').eq('id', params.id).single();
  return NextResponse.json({ order: updated || order, verification, check: result });
}
