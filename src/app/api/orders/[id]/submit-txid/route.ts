import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { updateOrder } from '@/lib/orders';
import { validateTxid, canSubmitTxid } from '@/lib/txid';
import { telegramUserFromInitData } from '@/lib/telegram';
import { notifyAdmin } from '@/lib/notify';
import { tronscanTxUrl } from '@/lib/tron';

export const dynamic = 'force-dynamic';

// POST /api/orders/[id]/submit-txid — { trx_txid, initData? }
// User submits the TRX TXID of their payment (from TronLink / TronScan).
// Order moves to TXID_SUBMITTED and the 30-min timer freezes while the admin
// reviews it. When TELEGRAM_BOT_TOKEN is set, initData is verified exactly
// like /api/orders/create and must belong to the order's telegram_id.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { data: order, error } = await db().from('orders').select('*').eq('id', params.id).single();
  if (error || !order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  // Telegram identity: when a bot token is configured, the caller must prove
  // they are the order's owner via initData (same pattern as orders/create).
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const initData = typeof body.initData === 'string' ? body.initData : '';
    const user = initData ? telegramUserFromInitData(initData) : null;
    if (!user) {
      return NextResponse.json(
        { error: 'Open the app from the Telegram bot Mini App button — Telegram identity could not be verified.' },
        { status: 401 },
      );
    }
    if (String(user.id) !== String(order.telegram_id)) {
      return NextResponse.json({ error: 'This order belongs to a different Telegram user.' }, { status: 401 });
    }
  }

  const validated = validateTxid(String(body.trx_txid || ''));
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const guard = canSubmitTxid(order, new Date());
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 409 });

  await updateOrder(params.id, {
    trx_txid: validated.txid,
    txid_submitted_at: new Date().toISOString(),
    txid_submitted_by: 'user',
    status: 'TXID_SUBMITTED',
  });
  const { data: updated } = await db().from('orders').select('*').eq('id', params.id).single();

  void notifyAdmin(
    `🧾 TXID submitted for review\nOrder ${params.id}\n${Number(order.usdt_amount).toLocaleString()} USDT ← ${Number(order.trx_amount).toLocaleString()} TRX\nUser: @${order.telegram_username || order.telegram_id} (${order.telegram_id})\nTXID: ${validated.txid}\n${tronscanTxUrl(validated.txid)}\nCheck /admin → Pending TXID review.`,
  );

  return NextResponse.json({ order: updated || order });
}
