import crypto from 'crypto';

/**
 * Stateless admin auth: the token is HMAC-SHA256(ADMIN_PASSWORD, "trx-usdt-admin").
 * No sessions, no cookies to manage. Rotate by changing ADMIN_PASSWORD.
 */
export function adminToken(): string {
  const pw = process.env.ADMIN_PASSWORD || '';
  return crypto.createHmac('sha256', pw).update('trx-usdt-admin').digest('hex');
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !token) return false;
  const expected = adminToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}
