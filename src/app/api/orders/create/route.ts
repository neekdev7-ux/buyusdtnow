import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { getSettings, isPaymentAddressConfigured } from '@/lib/settings';
import { calcTrxAmount, isValidTrc20Address, orderExpiry } from '@/lib/tron';
import { telegramUserFromInitData } from '@/lib/telegram';
import { upsertUser } from '@/lib/users';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/create
 * Body: { usdtAmount, receiveAddress, telegramId?, telegramUsername?, initData? }
 *
 * If TELEGRAM_BOT_TOKEN is set and initData is supplied, the Telegram user is
 * verified via HMAC-SHA256 (see lib/telegram.ts). If no bot token is configured,
 * telegramId from the body is accepted but the order is created with
 * source=unverified (see README) — the app must not be trusted for payouts
 * until the bot token is set.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const usdtAmount = Number(body.usdtAmount);
  const receiveAddress = String(body.receiveAddress || '').trim();
  const settings = await getSettings();

  if (!Number.isInteger(usdtAmount) || usdtAmount < settings.minBuyUsdt || usdtAmount > settings.maxBuyUsdt) {
    return NextResponse.json(
      { error: `Amount must be a whole number between ${settings.minBuyUsdt} and ${settings.maxBuyUsdt} USDT.` },
      { status: 400 },
    );
  }
  if (!isValidTrc20Address(receiveAddress)) {
    return NextResponse.json({ error: 'Invalid USDT TRC20 receive address.' }, { status: 400 });
  }
  if (!isPaymentAddressConfigured(settings.trxPaymentAddress)) {
    return NextResponse.json({ error: 'Payment wallet is not configured yet. Please try again later.' }, { status: 503 });
  }

  // Telegram identity: verified via initData when a bot token exists.
  // When a bot token IS configured, a valid initData is REQUIRED — the app is
  // gated on Telegram identity (see TelegramGate) and a direct browser open
  // must not be able to create orders under someone else's Telegram ID.
  let telegramId = typeof body.telegramId === 'string' ? body.telegramId : '';
  let telegramUsername = typeof body.telegramUsername === 'string' ? body.telegramUsername : '';
  let verified = false;
  const initData = typeof body.initData === 'string' ? body.initData : '';
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const user = initData ? telegramUserFromInitData(initData) : null;
    if (!user) {
      return NextResponse.json(
        { error: 'Open the app from the Telegram bot Mini App button — Telegram identity could not be verified.' },
        { status: 401 },
      );
    }
    telegramId = String(user.id);
    telegramUsername = user.username || telegramUsername;
    verified = true;
  }
  if (!telegramId) telegramId = 'web-unknown';

  // Record the user (best-effort) so every buyer shows in /admin Users,
  // even if they never message support or start the bot.
  if (telegramId !== 'web-unknown') void upsertUser(telegramId, telegramUsername || null);

  // Rate-locked snapshot: the rate at creation time is what the user pays.
  const { trx, sun } = calcTrxAmount(usdtAmount, settings.trxRate);
  const createdAt = new Date();
  const expiresAt = orderExpiry(createdAt, settings.expiryMinutes);

  const { data, error } = await db()
    .from('orders')
    .insert({
      telegram_id: telegramId,
      telegram_username: telegramUsername || null,
      usdt_amount: usdtAmount,
      trx_rate: settings.trxRate,
      trx_amount: trx,
      trx_amount_sun: sun.toString(),
      receive_address: receiveAddress,
      payment_address: settings.trxPaymentAddress,
      status: 'AWAITING_PAYMENT',
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: `Could not create order: ${error?.message || 'unknown error'}` }, { status: 500 });
  }

  return NextResponse.json({
    order: data,
    verified, // false when no bot token / no initData — see comment above
    note: verified
      ? undefined
      : 'Telegram identity unverified (no bot token / initData). Set TELEGRAM_BOT_TOKEN to enable verification.',
  });
}
