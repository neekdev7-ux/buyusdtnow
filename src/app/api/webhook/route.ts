import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { notifyAdmin, sendTelegramMessage } from '@/lib/notify';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'YOUR_APP_URL';
const CHANNEL = process.env.OFFICIAL_CHANNEL_USERNAME || '';

/**
 * POST /api/webhook — Telegram bot webhook.
 * - /start: welcome + Open App + Official Channel buttons.
 *   (A /start argument, if any, is ignored — there is no invite system.)
 * - /help, /orders as before.
 * - Any other DM text: treated as a support message — stored and forwarded
 *   to the admin (ADMIN_TELEGRAM_ID).
 * - New joins (/start) are forwarded to the admin.
 * Set the webhook with: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/webhook
 * (see BOT_SETUP.md). Requires TELEGRAM_BOT_TOKEN.
 */
export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' }, { status: 500 });
  }
  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const message = update.message;
  if (!message || !message.chat) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const text = String(message.text || '').trim();
  const from = message.from || {};
  const fromId = from.id;
  const username = from.username || '';

  const openAppButton = { text: '💱 Open App — Buy USDT', web_app: { url: APP_URL } };
  const channelButton = CHANNEL
    ? { text: '📢 Official Channel', url: `https://t.me/${CHANNEL.replace(/^@/, '')}` }
    : null;
  const welcomeKeyboard = {
    inline_keyboard: [[openAppButton], ...(channelButton ? [[channelButton]] : [])],
  };

  if (text === '/start' || text.startsWith('/start ')) {
    await sendTelegramMessage(
      chatId,
      '👋 Welcome to the TRX → USDT Exchange!\n\n' +
        'Buy USDT (TRC20) with TRX at a fixed rate.\n' +
        '• Minimum buy: 1000 USDT\n' +
        '• Pay TRX, receive USDT after blockchain confirmation.\n\n' +
        'Tap the button below to open the app.',
      welcomeKeyboard,
    );
    // Forward the new join to the admin.
    if (fromId) {
      void notifyAdmin(`👤 New user joined: @${username || '—'} (id ${fromId})`);
    }
  } else if (text === '/help') {
    await sendTelegramMessage(
      chatId,
      'How it works:\n' +
        '1. Open the app and choose an amount (min 1000 USDT).\n' +
        '2. Enter your USDT (TRC20) receive address.\n' +
        '3. Send the exact TRX amount shown to the payment address.\n' +
        '4. After 19 on-chain confirmations, your USDT is sent.\n\n' +
        'Commands: /start — open the app · /orders — your recent orders · /help — this message\n\n' +
        'Need help? Just send a message here and support will reply.',
    );
  } else if (text === '/orders') {
    if (!fromId || !isSupabaseConfigured()) {
      await sendTelegramMessage(chatId, 'Could not load your orders right now. Open the app → My Orders.');
      return NextResponse.json({ ok: true });
    }
    const { data } = await db()
      .from('orders')
      .select('id, usdt_amount, trx_amount, status, created_at')
      .eq('telegram_id', String(fromId))
      .order('created_at', { ascending: false })
      .limit(5);
    const orders = data || [];
    if (orders.length === 0) {
      await sendTelegramMessage(
        chatId,
        'You have no orders yet. Tap the button below to buy USDT.',
        { inline_keyboard: [[openAppButton]] },
      );
    } else {
      const lines = orders.map(
        (o: Record<string, unknown>) =>
          `• ${Number(o.usdt_amount).toLocaleString()} USDT — ${o.status} (${new Date(String(o.created_at)).toLocaleDateString()})`,
      );
      await sendTelegramMessage(chatId, `Your recent orders:\n${lines.join('\n')}\n\nView them in the app → My Orders.`);
    }
  } else if (text && message.chat.type === 'private') {
    // Plain DM = support message: store it and forward to the admin.
    if (fromId && isSupabaseConfigured()) {
      await db().from('support_messages').insert({
        telegram_id: String(fromId),
        telegram_username: username || null,
        direction: 'user',
        message: text.slice(0, 2000),
      });
    }
    void notifyAdmin(`💬 Support DM from @${username || fromId} (${fromId}):\n${text.slice(0, 1000)}`);
    await sendTelegramMessage(
      chatId,
      'Thanks — your message was sent to support. We will reply here.',
    );
  }

  return NextResponse.json({ ok: true });
}
