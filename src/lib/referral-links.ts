// Pure referral-link helpers — no imports, so node --test can import directly.
// Link format (telegram_mini_app skill): t.me/<bot>/<app>?startapp=ref_<ID>
// NEVER bot-level ?start= for mini-app referrals — it never reaches the app.

export function parseRefCode(startParam: string | null | undefined): string | null {
  if (!startParam) return null;
  const m = /^ref_(\d+)$/.exec(startParam.trim());
  return m ? m[1] : null;
}

/** Referral deep link for a user (null when bot/app names are not configured). */
export function referralLink(telegramId: string | number): string | null {
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  const app = process.env.TELEGRAM_APP_SHORT_NAME;
  if (!bot || !app) return null;
  return `https://t.me/${bot}/${app}?startapp=ref_${telegramId}`;
}
