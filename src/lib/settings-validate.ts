// Admin settings validation + order-delete rules — pure functions, no
// imports, so they can be unit-tested with `npm test` and reused by both
// the server route (POST /api/admin/settings) and the admin page (client).
// Keep the messages identical on both sides so the admin sees the same
// error whether the check runs in the browser or on the server.

export interface SettingsValues {
  trxRate: number;
  minBuyUsdt: number;
  maxBuyUsdt: number;
  expiryMinutes: number;
  trxPaymentAddress: string;
  usdtHotWalletAddress: string;
  supportUsername: string;
  autoSendUsdt: boolean;
  maxAutoSendUsdt: number;
}

export const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export const MIN_BUY_USDT_FLOOR = 100;
export const MIN_EXPIRY_MINUTES = 5;

/** Validate a full candidate settings object (merged current + edits). */
export function validateSettings(s: SettingsValues): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(s.trxRate) || s.trxRate <= 0) {
    return { ok: false, error: 'Rate must be greater than 0 TRX per USDT.' };
  }
  if (!Number.isInteger(s.minBuyUsdt) || s.minBuyUsdt < MIN_BUY_USDT_FLOOR) {
    return { ok: false, error: `Min buy must be at least ${MIN_BUY_USDT_FLOOR} USDT.` };
  }
  if (!Number.isInteger(s.maxBuyUsdt) || s.maxBuyUsdt <= s.minBuyUsdt) {
    return { ok: false, error: 'Max buy must be greater than min buy.' };
  }
  if (!Number.isInteger(s.expiryMinutes) || s.expiryMinutes < MIN_EXPIRY_MINUTES) {
    return { ok: false, error: `Order expiry must be at least ${MIN_EXPIRY_MINUTES} minutes.` };
  }
  if (s.trxPaymentAddress && !TRON_ADDRESS_RE.test(s.trxPaymentAddress.trim())) {
    return { ok: false, error: 'TRX payment address is not a valid TRON address (starts with T, 34 characters).' };
  }
  if (s.usdtHotWalletAddress && !TRON_ADDRESS_RE.test(s.usdtHotWalletAddress.trim())) {
    return { ok: false, error: 'USDT hot-wallet address is not a valid TRON address (starts with T, 34 characters).' };
  }
  if (!Number.isFinite(s.maxAutoSendUsdt) || s.maxAutoSendUsdt < 0) {
    return { ok: false, error: 'Max auto-send must be 0 or more.' };
  }
  return { ok: true };
}

/**
 * Orders that may be deleted by the admin (housekeeping only). Paid or
 * completed orders must never be deleted — they are the payout record.
 * Rejected orders are stored as FAILED, so FAILED covers rejected ones.
 */
export const DELETABLE_ORDER_STATUSES = ['EXPIRED', 'FAILED'] as const;

export function canDeleteOrder(status: string): boolean {
  return (DELETABLE_ORDER_STATUSES as readonly string[]).includes(status);
}
