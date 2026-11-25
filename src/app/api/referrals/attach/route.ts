import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { telegramUserFromInitData } from '@/lib/telegram';
import { attachReferral, parseRefCode } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

// POST /api/referrals/attach — called on first app open.
// Body: { initData, startParam? } — verifies Telegram identity, then attaches
// the referrer from the startapp param (ref_CODE) or, as a fallback, from a
// pending bot-level /start referral recorded by the webhook.
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
  const initData = typeof body.initData === 'string' ? body.initData : '';
  const startParam = typeof body.startParam === 'string' ? body.startParam : '';

  let telegramId = typeof body.telegramId === 'string' ? body.telegramId : '';
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const user = initData ? telegramUserFromInitData(initData) : null;
    if (!user) {
      return NextResponse.json({ error: 'Telegram identity could not be verified.' }, { status: 401 });
    }
    telegramId = String(user.id);
  }
  if (!telegramId) {
    return NextResponse.json({ error: 'telegramId is required.' }, { status: 400 });
  }

  try {
    const result = await attachReferral(telegramId, parseRefCode(startParam));
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not attach referral: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
