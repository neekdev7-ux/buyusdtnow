import { db } from './supabase';
import { MARKET_REFERENCE } from './rates';
import {
  applySettingsRows,
  isPaymentAddressConfigured,
  publicConfig,
  type ExchangeSettings,
  type SettingsRow,
} from './settings-merge';

export { MARKET_REFERENCE } from './rates';
export { applySettingsRows, isPaymentAddressConfigured, publicConfig };
export type { ExchangeSettings, SettingsRow };

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

/** Where the returned settings came from — 'db' means the settings table was read live. */
export type SettingsSource = 'db' | 'defaults';

export interface SettingsWithMeta {
  settings: ExchangeSettings;
  /** 'db' when the settings table was read successfully, 'defaults' when the DB read failed. */
  source: SettingsSource;
  /** Newest updated_at among the settings rows (null when the DB read failed / no rows). */
  updatedAt: string | null;
  /** Non-empty when the DB read failed — the reason, for server logs. */
  error?: string;
}

/**
 * Settings = env defaults, overridden by rows in the `settings` table (admin edits).
 * Never throws: on a DB failure it returns the env defaults AND reports the
 * failure (source 'defaults' + error) instead of silently pretending the
 * defaults are the live settings — a silent fallback previously made a
 * broken DB read invisible (admin saves did not reach the home page).
 */
export async function getSettingsWithMeta(): Promise<SettingsWithMeta> {
  try {
    const { data, error } = await db().from('settings').select('key, value, updated_at');
    if (error) {
      console.warn('[settings] DB read failed, using env defaults:', error.message);
      return { settings: { ...DEFAULT_SETTINGS }, source: 'defaults', updatedAt: null, error: error.message };
    }
    const rows = (data || []) as SettingsRow[];
    const updatedAt = rows.reduce<string | null>(
      (latest, r) => (!r.updated_at ? latest : !latest || r.updated_at > latest ? r.updated_at : latest),
      null,
    );
    return { settings: applySettingsRows(DEFAULT_SETTINGS, rows), source: 'db', updatedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[settings] DB read failed, using env defaults:', message);
    return { settings: { ...DEFAULT_SETTINGS }, source: 'defaults', updatedAt: null, error: message };
  }
}

/** Settings = env defaults, overridden by rows in the `settings` table (admin edits). */
export async function getSettings(): Promise<ExchangeSettings> {
  return (await getSettingsWithMeta()).settings;
}
