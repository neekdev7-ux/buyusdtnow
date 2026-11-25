import { NextRequest, NextResponse } from 'next/server';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/admin';

export const dynamic = 'force-dynamic';

function unauthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return !verifyAdminToken(token);
}

// GET /api/admin/support — all support messages, newest first (admin only).
export async function GET(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500 });
  }
  const { data, error } = await db()
    .from('support_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data || [] });
}
