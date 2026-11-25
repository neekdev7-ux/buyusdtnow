import { NextResponse } from 'next/server';
import { getSettingsWithMeta, publicConfig, MARKET_REFERENCE } from '@/lib/settings';
import { isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/config — public config for the buy page.
// MUST always reflect the CURRENT database settings (the admin panel edits
// them live). The response is explicitly no-store: an earlier version relied
// on `force-dynamic` alone and the response was served with
// `Cache-Control: public, max-age=0, must-revalidate`, so admin changes did
// not reach the home page. `settingsUpdatedAt` lets anyone verify the
// response is fresh (it is the newest updated_at in the settings table).
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase not configured — see DEPLOY.md' },
      { status: 500, headers: NO_STORE },
    );
  }
  const { settings, source, updatedAt, error } = await getSettingsWithMeta();
  if (source === 'defaults' && error) {
    // The DB read failed — say so in the server log (and the response) instead
    // of silently serving env defaults as if they were the live settings.
    console.warn('[config] serving env defaults, DB read failed:', error);
  }
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
  return NextResponse.json(
    {
      ...publicConfig(settings),
      // Freshness signal: when the settings in the DB were last changed.
      // Null means the DB read failed and env defaults are being served.
      settingsUpdatedAt: updatedAt,
      settingsSource: source,
      market: MARKET_REFERENCE,
      telegram: {
        botUsername,
        officialChannel: process.env.OFFICIAL_CHANNEL_USERNAME || '',
      },
    },
    { headers: NO_STORE },
  );
}
