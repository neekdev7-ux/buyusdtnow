import crypto from 'crypto';

/**
 * Validate Telegram WebApp initData per Telegram docs:
 *   data_check_string = sorted "key=value" lines (excluding `hash`),
 *   secret_key = HMAC-SHA256(key="WebAppData", msg=botToken),
 *   hash = HMAC-SHA256(secret_key, data_check_string) as hex.
 * Returns the parsed user object, or null when invalid / no bot token.
 */
export function validateInitData(
  initData: string,
  botToken: string,
): { id: number; username?: string; first_name?: string } | null {
  if (!initData || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    const pairs: string[] = [];
    params.forEach((value, key) => {
      if (key !== 'hash') pairs.push(`${key}=${value}`);
    });
    pairs.sort();
    const dataCheckString = pairs.join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    const a = Buffer.from(computed);
    const b = Buffer.from(hash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const userRaw = params.get('user');
    if (!userRaw) return null;
    const user = JSON.parse(userRaw) as { id: number; username?: string; first_name?: string };
    if (!user || typeof user.id !== 'number') return null;
    return user;
  } catch {
    return null;
  }
}

/** Extract the Telegram user from initData when a bot token is configured. */
export function telegramUserFromInitData(
  initData: string | undefined | null,
): { id: number; username?: string; first_name?: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !initData) return null;
  return validateInitData(initData, token);
}

/**
 * Is the Telegram user behind this initData the admin?
 * Server-side only: initData is verified with TELEGRAM_BOT_TOKEN and the
 * user id is compared to ADMIN_TELEGRAM_ID from the server env. The admin
 * id is never embedded in client code. Returns false when the bot token or
 * the admin id is not configured, or initData is invalid.
 * Used by POST /api/me to decide whether the footer menubar shows the
 * Admin tab. Hiding the tab is UI-only — /admin still requires the password.
 * (Lives here, not in lib/admin.ts, so it stays importable by plain
 * node --test type-stripping: this file has no relative imports.)
 */
export function isTelegramAdmin(initData: string | undefined | null): boolean {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId || !initData) return false;
  const user = telegramUserFromInitData(initData);
  return user !== null && String(user.id) === adminId;
}
