import { db } from './supabase';
import { referralLink, parseRefCode } from './referral-links';

export { referralLink, parseRefCode } from './referral-links';

/**
 * Referrals (per telegram_mini_app skill):
 * - Link format: t.me/<bot_username>/<app_short_name>?startapp=ref_<TELEGRAM_ID>
 *   (NEVER bot-level ?start= for mini-app referrals — it never reaches the app.)
 * - Webhook fallback: a bot-level /start ref_CODE is recorded in
 *   `pending_referrals` and attached on the user's first app open.
 */

export interface AttachResult {
  attached: boolean;
  referrerTelegramId?: string;
  reason?: string;
}

/**
 * Attach a referrer to a user. Idempotent: one referrer per user, never self.
 * Also consumes any pending bot-level referral for this user (webhook fallback).
 */
export async function attachReferral(
  telegramId: string,
  directCode: string | null,
): Promise<AttachResult> {
  // Already has a referrer?
  const { data: existing } = await db()
    .from('referrals')
    .select('referrer_telegram_id')
    .eq('referred_telegram_id', telegramId)
    .maybeSingle();
  if (existing) {
    return { attached: false, reason: 'Referrer already recorded.' };
  }

  // Direct startapp code wins; otherwise fall back to a pending bot-level referral.
  let referrerId = directCode;
  if (!referrerId) {
    const { data: pending } = await db()
      .from('pending_referrals')
      .select('referrer_telegram_id')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pending) referrerId = String(pending.referrer_telegram_id);
  }
  if (!referrerId) return { attached: false, reason: 'No referral code.' };
  if (referrerId === telegramId) return { attached: false, reason: 'Cannot refer yourself.' };

  const { error } = await db().from('referrals').insert({
    referrer_telegram_id: referrerId,
    referred_telegram_id: telegramId,
    source: directCode ? 'startapp' : 'bot_start_fallback',
  });
  if (error) {
    // Unique-violation race: someone already attached.
    if (String(error.message).includes('duplicate')) {
      return { attached: false, reason: 'Referrer already recorded.' };
    }
    throw new Error(error.message);
  }
  // Consume any pending rows for this user.
  await db().from('pending_referrals').delete().eq('telegram_id', telegramId);
  return { attached: true, referrerTelegramId: referrerId };
}

/** Record a bot-level /start ref_CODE (webhook fallback). */
export async function recordPendingReferral(telegramId: string, referrerId: string): Promise<void> {
  if (referrerId === telegramId) return;
  await db().from('pending_referrals').insert({
    telegram_id: telegramId,
    referrer_telegram_id: referrerId,
    code: `ref_${referrerId}`,
  });
}
