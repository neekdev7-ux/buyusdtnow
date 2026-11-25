import { db } from './supabase';
import { MARKET_REFERENCE } from './rates';

export { MARKET_REFERENCE } from './rates';

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

export const DEFAULT_SETTINGS: ExchangeSettings = {
  trxRate: Number(process.env.FIXED_TRX_PER_USDT || 3.5),
  minBuyUsdt: Number(process.env.MIN_BUY_USDT || 1000),
  maxBuyUsdt: Number(process.env.MAX_BUY_USDT || 100000),
  expiryMinutes: Number(process.env.ORDER_EXPIRY_MINUTES || 30),
  trxPaymentAddress: process.env.TRX_PAYMENT_ADDRESS || '',
  usdtHotWalletAddress: process.env.USDT_HOT_WALLET_ADDRESS || '',
  supportUsername: process.env.SUPPORT_USERNAME || 'YourSupport',
  autoSendUsdt: process.env.AUTO_SEND_USDT === 'true',
  maxAutoSendUsdt: Number(process.env.MAX_AUTO_SEND_USDT || 5000),
};

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

/** Settings = env defaults, overridden by rows in the `settings` table (admin edits). */
export async function getSettings(): Promise<ExchangeSettings> {
  const settings: ExchangeSettings = { ...DEFAULT_SETTINGS };
  try {
    const { data, error } = await db().from('settings').select('key, value');
    if (error || !data) return settings;
    for (const row of data as { key: string; value: string }[]) {
      const field = DB_KEY_MAP[row.key];
      if (!field) continue;
      const current = settings[field];
      if (typeof current === 'number') {
        const n = Number(row.value);
        if (Number.isFinite(n)) (settings as unknown as Record<string, unknown>)[field] = n;
      } else if (typeof current === 'boolean') {
        (settings as unknown as Record<string, unknown>)[field] = row.value === 'true';
      } else {
        (settings as unknown as Record<string, unknown>)[field] = row.value;
      }
    }
  } catch {
    // DB unavailable / not configured — fall back to env defaults.
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

