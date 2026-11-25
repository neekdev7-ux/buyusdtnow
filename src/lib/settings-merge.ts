/**
 * Pure settings helpers — ZERO imports, so they can be unit-tested with
 * plain `node --test` (Node's type-stripping cannot resolve the extensionless
 * relative imports that the rest of src/lib uses).
 */

export interface ExchangeSettings {
  trxRate: number; // TRX per 1 USDT (fixed)
  minBuyUsdt: number;
  maxBuyUsdt: number;
  expiryMinutes: number;
  trxPaymentAddress: string; // admin wallet receiving TRX
  usdtHotWalletAddress: string; // hot wallet sending USDT
  supportUsername: string;
  autoSendUsdt: boolean;
  maxAutoSendUsdt: number;
}

/** A placeholder / unset payment address — the app must show "not configured". */
export function isPaymentAddressConfigured(addr: string): boolean {
  return Boolean(addr) && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
}

const DB_KEY_MAP: Record<string, keyof ExchangeSettings> = {
  trx_rate: 'trxRate',
  min_buy_usdt: 'minBuyUsdt',
  max_buy_usdt: 'maxBuyUsdt',
  expiry_minutes: 'expiryMinutes',
  trx_payment_address: 'trxPaymentAddress',
  usdt_hot_wallet_address: 'usdtHotWalletAddress',
  support_username: 'supportUsername',
  auto_send_usdt: 'autoSendUsdt',
  max_auto_send_usdt: 'maxAutoSendUsdt',
};

export interface SettingsRow {
  key: string;
  value: string;
  updated_at?: string | null;
}

/**
 * Pure row-merge: DB rows override the env defaults. Unknown keys are
 * ignored, invalid numbers are ignored (the default survives).
 */
export function applySettingsRows(
  base: ExchangeSettings,
  rows: SettingsRow[],
): ExchangeSettings {
  const settings: ExchangeSettings = { ...base };
  for (const row of rows) {
    const field = DB_KEY_MAP[row.key];
    if (!field) continue;
    const current = settings[field];
    if (typeof current === 'number') {
      // An empty string must not become 0 (Number('') === 0) — ignore it.
      if (row.value.trim() === '') continue;
      const n = Number(row.value);
      if (Number.isFinite(n)) (settings as unknown as Record<string, unknown>)[field] = n;
    } else if (typeof current === 'boolean') {
      (settings as unknown as Record<string, unknown>)[field] = row.value === 'true';
    } else {
      (settings as unknown as Record<string, unknown>)[field] = row.value;
    }
  }
  return settings;
}

/** Public config payload for the buy page (no secrets). */
export function publicConfig(settings: ExchangeSettings) {
  return {
    trxRate: settings.trxRate,
    minBuyUsdt: settings.minBuyUsdt,
    maxBuyUsdt: settings.maxBuyUsdt,
    expiryMinutes: settings.expiryMinutes,
    paymentAddress: settings.trxPaymentAddress,
    paymentAddressConfigured: isPaymentAddressConfigured(settings.trxPaymentAddress),
    supportUsername: settings.supportUsername,
    autoSendUsdt: settings.autoSendUsdt,
  };
}
