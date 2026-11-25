import { NextResponse } from 'next/server';
import { isTelegramAdmin } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

/**
 * POST /api/me — who is opening the app?
 * Body: { initData } (Telegram WebApp initData string).
 * Verifies initData server-side with TELEGRAM_BOT_TOKEN and compares the
 * Telegram user id to ADMIN_TELEGRAM_ID (server env only — the admin id is
 * never sent to the client). Returns { isAdmin: boolean }.
 * Used by the footer menubar to show the Admin tab only to the admin.
 * Hiding the tab is UI-only: /admin itself still requires the password.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { initData?: unknown };
  const initData = typeof body.initData === 'string' ? body.initData : '';
  return NextResponse.json({ isAdmin: isTelegramAdmin(initData) });
}
