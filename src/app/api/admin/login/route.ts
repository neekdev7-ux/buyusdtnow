import { NextRequest, NextResponse } from 'next/server';
import { adminToken, isAdminConfigured } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// POST /api/admin/login — { password } -> { token } (stateless HMAC token).
export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Admin password is not configured (ADMIN_PASSWORD).' }, { status: 500 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (body.password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }
  return NextResponse.json({ token: adminToken() });
}
