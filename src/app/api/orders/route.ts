import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/orders?telegram_id=123 — list a user's orders, newest first.
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  const telegramId = req.nextUrl.searchParams.get('telegram_id');
  if (!telegramId) {
    return NextResponse.json({ error: 'telegram_id is required.' }, { status: 400 });
  }
  const { data, error } = await db()
    .from('orders')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ orders: data || [] });
}
