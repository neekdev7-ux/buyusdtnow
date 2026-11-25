import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { telegramUserFromInitData } from '@/lib/telegram';
import { notifyAdmin } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// POST /api/support — user sends a support message from the app.
// Body: { initData?, telegramId?, message } — stored + forwarded to the admin.
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
  const message = String(body.message || '').trim();
  if (!message || message.length > 2000) {
    return NextResponse.json({ error: 'Message must be 1–2000 characters.' }, { status: 400 });
  }
  const initData = typeof body.initData === 'string' ? body.initData : '';
  let telegramId = typeof body.telegramId === 'string' ? body.telegramId : '';
  let username = typeof body.telegramUsername === 'string' ? body.telegramUsername : '';
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const user = initData ? telegramUserFromInitData(initData) : null;
    if (!user) {
      return NextResponse.json({ error: 'Telegram identity could not be verified.' }, { status: 401 });
    }
    telegramId = String(user.id);
    username = user.username || username;
  }
  if (!telegramId) {
    return NextResponse.json({ error: 'telegramId is required.' }, { status: 400 });
  }
  const { data, error } = await db()
    .from('support_messages')
    .insert({ telegram_id: telegramId, telegram_username: username || null, direction: 'user', message })
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json({ error: `Could not send message: ${error?.message || 'unknown error'}` }, { status: 500 });
  }
  // Forward to the admin on Telegram (fire-and-forget).
  void notifyAdmin(`💬 Support message from @${username || telegramId} (${telegramId}):\n${message}`);
  return NextResponse.json({ message: data });
}

// GET /api/support?telegram_id=123 — the user's support thread (both directions).
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  const telegramId = req.nextUrl.searchParams.get('telegram_id');
  if (!telegramId) {
    return NextResponse.json({ error: 'telegram_id is required.' }, { status: 400 });
  }
  const { data, error } = await db()
    .from('support_messages')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data || [] });
}
