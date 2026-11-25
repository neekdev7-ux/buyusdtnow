import { NextResponse } from 'next/server';
import { getSettings, publicConfig, MARKET_REFERENCE } from '@/lib/settings';
import { isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase not configured — see DEPLOY.md' },
      { status: 500 },
    );
  }
  const settings = await getSettings();
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
  return NextResponse.json({
    ...publicConfig(settings),
    market: MARKET_REFERENCE,
    telegram: {
      botUsername,
      officialChannel: process.env.OFFICIAL_CHANNEL_USERNAME || '',
    },
  });
}
