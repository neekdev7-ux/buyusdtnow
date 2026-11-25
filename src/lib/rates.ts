// Rate reference data. The FIXED rate the exchange charges is admin-configurable
// (settings.trxRate, default 3.50 TRX/USDT). This file only holds the MARKET
// reference shown next to it so users can see the markup.

/** Market snapshot — update when the market moves materially. */
export const MARKET_REFERENCE = {
  trxUsd: 0.308,
  trxPerUsdt: 3.25, // 1 / 0.308 ≈ 3.25 TRX per USDT at market
  asOf: '2026-11-25',
};

/** Markup of the fixed rate over the market reference, in percent. */
export function rateMarkupPct(fixedRate: number, marketRate: number = MARKET_REFERENCE.trxPerUsdt): number {
  return ((fixedRate - marketRate) / marketRate) * 100;
}
