import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/admin';
import { sendTelegramMessage } from '@/lib/notify';

export const dynamic = 'force-dynamic';

function unauthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return !verifyAdminToken(token);
}

// POST /api/admin/support/[id]/reply — { text }
// Admin replies from the panel: stored in the thread AND delivered to the
// user by Telegram DM (per telegram_mini_app skill).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (unauthorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const text = String(body.text || '').trim();
  if (!text || text.length > 2000) {
    return NextResponse.json({ error: 'Reply must be 1–2000 characters.' }, { status: 400 });
  }
  const { data: original, error } = await db().from('support_messages').select('*').eq('id', params.id).single();
  if (error || !original) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

  const { data: reply, error: insertError } = await db()
    .from('support_messages')
    .insert({
      telegram_id: original.telegram_id,
      telegram_username: original.telegram_username,
      direction: 'admin',
      message: text,
    })
    .select()
    .single();
  if (insertError || !reply) {
    return NextResponse.json({ error: `Could not save reply: ${insertError?.message || 'unknown error'}` }, { status: 500 });
  }
  await db().from('support_messages').update({ replied: true }).eq('id', params.id);

  // Deliver by Telegram DM (best-effort: fails if the user blocked the bot).
  const delivered = await sendTelegramMessage(
    original.telegram_id,
    `💬 Support reply:\n${text}`,
  );
  return NextResponse.json({ reply, delivered });
}
