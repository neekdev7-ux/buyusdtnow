import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { referralLink } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

// GET /api/referrals?telegram_id=123 — referral count + link for a user.
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  const telegramId = req.nextUrl.searchParams.get('telegram_id');
  if (!telegramId) {
    return NextResponse.json({ error: 'telegram_id is required.' }, { status: 400 });
  }
  const { data, error } = await db()
    .from('referrals')
    .select('referred_telegram_id, source, created_at')
    .eq('referrer_telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    count: (data || []).length,
    referrals: data || [],
    link: referralLink(telegramId),
  });
}
