// TRON / TRC20 helpers — pure functions, no network, no secrets.
// Uses only erasable TypeScript so `node --test` can import it directly.

/** Real USDT TRC20 contract on TRON mainnet. Do not change. */
export const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

/** A TRON base58 address: starts with T, 34 chars, no 0/O/I/l. */
export const TRC20_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isValidTrc20Address(addr: string): boolean {
  if (typeof addr !== 'string') return false;
  return TRC20_ADDRESS_RE.test(addr.trim());
}

/** TRX has 6 decimals: 1 TRX = 1,000,000 SUN. Exact integer math via strings. */
export function trxToSun(trx: number | string): bigint {
  const s = String(trx).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid TRX amount: ${trx}`);
  const [whole, frac = ''] = s.split('.');
  if (frac.length > 6) throw new Error(`TRX amount has more than 6 decimals: ${trx}`);
  const fracPadded = (frac + '000000').slice(0, 6);
  return BigInt(whole) * 1000000n + BigInt(fracPadded);
}

/** SUN (bigint) -> TRX as a trimmed decimal string, e.g. 3500000n -> "3.5". */
export function sunToTrx(sun: bigint | number | string): string {
  const v = BigInt(sun);
  const whole = v / 1000000n;
  const frac = (v % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/**
 * TRX to pay for a USDT amount at a fixed rate, rounded to 6 decimals
 * (TRX smallest unit). Returns the TRX number, its string, and exact SUN.
 * Example: 1000 USDT @ 3.50 = 3500 TRX = 3_500_000_000 SUN.
 */
export function calcTrxAmount(
  usdtAmount: number,
  rate: number,
): { trx: number; trxStr: string; sun: bigint } {
  if (!Number.isFinite(usdtAmount) || usdtAmount <= 0) throw new Error('USDT amount must be positive');
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Rate must be positive');
  const trx = Math.round(usdtAmount * rate * 1e6) / 1e6;
  return { trx, trxStr: String(trx), sun: trxToSun(trx) };
}

/** Number of on-chain confirmations required before USDT is released. */
export const CONFIRMATIONS_REQUIRED = 19;

/** Order expiry: createdAt + minutes. */
export function orderExpiry(createdAt: Date, minutes: number): Date {
  return new Date(createdAt.getTime() + minutes * 60_000);
}

export function isExpired(expiresAt: Date | string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

/** Base58 (Bitcoin alphabet) decode — used to compare TronGrid hex addresses. */
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58ToHex(address: string): string {
  let bytes: number[] = [0];
  for (const ch of address) {
    const idx = B58_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base58 character: ${ch}`);
    let carry = idx;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading '1's are leading zero bytes.
  let leadingZeros = 0;
  for (const ch of address) {
    if (ch === '1') leadingZeros++;
    else break;
  }
  const reversed = bytes.reverse();
  const out = new Uint8Array(leadingZeros + reversed.length);
  out.set(reversed, leadingZeros);
  // TRON address = 1 version byte (0x41) + 20 address bytes + 4 checksum bytes.
  // Strip version + checksum, return the 20-byte address as hex (no 0x).
  if (out.length !== 25) throw new Error(`Invalid TRON address length: ${address}`);
  return Buffer.from(out.slice(1, 21)).toString('hex');
}

/** TronScan link for a transaction id (works with hex or base58 txids). */
export function tronscanTxUrl(txid: string): string {
  return `https://tronscan.org/#/transaction/${txid}`;
}

/** TronScan link for an address. */
export function tronscanAddressUrl(address: string): string {
  return `https://tronscan.org/#/address/${address}`;
}
