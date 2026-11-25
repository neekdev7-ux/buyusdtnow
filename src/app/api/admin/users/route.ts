import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/admin';
import { listUsers } from '@/lib/users';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Admin responses are explicitly no-store: the admin panel must always show
// the live data, never a cached copy.
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function unauthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return !verifyAdminToken(token);
}

// GET /api/admin/users — every Telegram user who opened the app or placed
// an order (newest activity first), with order counts + total USDT ordered.
// Returns [] when the `users` table has not been created yet (run
// supabase-migration-users.sql once) — the admin panel then shows an empty
// list instead of failing.
export async function GET(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: NO_STORE });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured — see DEPLOY.md' }, { status: 500, headers: NO_STORE });
  }
  const users = await listUsers();
  return NextResponse.json({ users }, { headers: NO_STORE });
}
