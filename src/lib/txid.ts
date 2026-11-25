// Manual TXID deposit flow — pure helpers + TronGrid verification.
// This file intentionally imports NOTHING from the rest of src/lib:
//   - `node --test` runs these tests with type stripping, where a relative
//     import without a `.ts` extension fails to resolve, and
//   - `next build` fails on an import path ending in `.ts` (TS5097).
// So the two tiny pieces this file needs from lib/tron.ts (base58 -> hex and
// the 19-confirmation requirement) are re-implemented / re-stated here and
// cross-checked against lib/tron.ts in tests/txid.test.ts — keep them in sync.

/** A TRON transaction id: exactly 64 hex chars (uppercase allowed). */
export const TXID_RE = /^[0-9a-fA-F]{64}$/;

export type ValidateTxidResult =
  | { ok: true; txid: string }
  | { ok: false; error: string };

/**
 * Validate a user-pasted TRX transaction id.
 * Trims whitespace, rejects the 0x prefix (TRON txids have none), requires
 * exactly 64 hex chars, normalizes to lowercase.
 */
export function validateTxid(raw: string): ValidateTxidResult {
  const txid = (raw || '').trim();
  if (!txid) return { ok: false, error: 'Transaction ID is required.' };
  if (txid.startsWith('0x') || txid.startsWith('0X')) {
    return {
      ok: false,
      error: 'TRON transaction IDs do not start with 0x — paste the 64-character hash from TronLink / TronScan.',
    };
  }
  if (!TXID_RE.test(txid)) {
    return {
      ok: false,
      error: 'Transaction ID must be exactly 64 hexadecimal characters (a–f, 0–9).',
    };
  }
  return { ok: true, txid: txid.toLowerCase() };
}

/** Minimal order shape canSubmitTxid needs: status + expiry. */
export interface SubmittableOrder {
  status: string;
  expires_at: string;
}

export type CanSubmitResult = { ok: true } | { ok: false; error: string };

/**
 * Guard for TXID submission: only an AWAITING_PAYMENT order whose 30-min
 * timer is still running may submit. Anything else gets a clear reason.
 */
export function canSubmitTxid(order: SubmittableOrder, now: Date = new Date()): CanSubmitResult {
  switch (order.status) {
    case 'TXID_SUBMITTED':
      return {
        ok: false,
        error: 'A TXID has already been submitted for this order — it is waiting for admin review.',
      };
    case 'TRX_RECEIVED':
      return {
        ok: false,
        error: 'Payment already detected on-chain — no TXID needed, confirmations are being counted.',
      };
    case 'TRX_CONFIRMED':
    case 'USDT_SENDING':
    case 'COMPLETED':
      return {
        ok: false,
        error: 'This order is already confirmed — no TXID needed.',
      };
    case 'EXPIRED':
      return {
        ok: false,
        error: 'This order expired — please create a new order.',
      };
    case 'FAILED':
      return {
        ok: false,
        error: 'This order failed — please create a new order or contact support.',
      };
    case 'AWAITING_PAYMENT':
      break;
    default:
      return { ok: false, error: `Order is ${order.status} — a TXID cannot be submitted now.` };
  }
  if (new Date(order.expires_at).getTime() <= now.getTime()) {
    return {
      ok: false,
      error: 'This order expired — the 30-minute payment window has ended. Please create a new order.',
    };
  }
  return { ok: true };
}

// --- TronGrid verification ---------------------------------------------------

const TRONGRID = 'https://api.trongrid.io';

/** Number of on-chain confirmations required before USDT is released.
 *  Must match CONFIRMATIONS_REQUIRED in lib/tron.ts (checked in tests). */
export const TXID_CONFIRMATIONS_REQUIRED = 19;

/** Headers for TronGrid calls (API key raises rate limits when set). */
export function trongridHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
  return headers;
}

/**
 * Base58 (Bitcoin alphabet) decode of a TRON address -> 20-byte hex.
 * Same algorithm as base58ToHex in lib/tron.ts (BigInt form), kept local
 * so this file stays import-free for `node --test` (see header note).
 * TRON address = 1 version byte (0x41) + 20 address bytes + 4 checksum bytes.
 */
export function base58ToHexLocal(address: string): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const ch of address) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base58 character: ${ch}`);
    n = n * 58n + BigInt(idx);
  }
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  let leadingZeros = 0;
  for (const ch of address) {
    if (ch === '1') leadingZeros++;
    else break;
  }
  const bytes = Buffer.from('00'.repeat(leadingZeros) + hex, 'hex');
  if (bytes.length !== 25) throw new Error(`Invalid TRON address length: ${address}`);
  return Buffer.from(bytes.subarray(1, 21)).toString('hex');
}

/** Minimal order shape the TronGrid check needs. */
export interface TrxOrderRef {
  payment_address: string;
  trx_amount_sun: number | string;
}

export type TxVerification =
  | { ok: true; fromHex: string | null; confirmations: number }
  | {
      ok: false;
      reason: 'not_found' | 'not_confirmed' | 'wrong_recipient' | 'wrong_amount';
      detail?: Record<string, unknown>;
    };

/** Minimal fetch shape: injectable so tests can mock it (never a live call). */
export interface TxHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type TxFetch = (
  url: string,
  init?: { headers?: Record<string, string>; cache?: string },
) => Promise<TxHttpResponse>;

interface TronGridTxDetail {
  txID?: string;
  blockNumber?: number;
  confirmed?: boolean;
  raw_data?: {
    contract?: Array<{
      parameter?: { value?: { amount?: number; owner_address?: string; to_address?: string } };
    }>;
  };
}

/**
 * Verify a user-submitted TRX TXID against TronGrid and the order.
 * - GET /v1/transactions/{txid}: tx must exist and be confirmed.
 * - The TRX transfer's to_address (hex) must equal the order's payment
 *   address, and the amount in SUN must equal trx_amount_sun exactly.
 * - Confirmations = current block (via /wallet/getnowblock) minus the tx
 *   block; requires >= TXID_CONFIRMATIONS_REQUIRED (19) for ok.
 * Throws on TronGrid transport errors (non-404); callers map that to 502.
 */
export async function verifyTrxTxOnTronGrid(
  txid: string,
  order: TrxOrderRef,
  fetchFn: TxFetch = fetch as unknown as TxFetch,
): Promise<TxVerification> {
  const res = await fetchFn(`${TRONGRID}/v1/transactions/${txid}`, {
    headers: trongridHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    if (res.status === 404) return { ok: false, reason: 'not_found', detail: { txid } };
    throw new Error(`TronGrid error ${res.status}`);
  }
  const json = (await res.json()) as { data?: TronGridTxDetail[] };
  const tx = (json.data || [])[0];
  if (!tx) return { ok: false, reason: 'not_found', detail: { txid } };

  const value = tx.raw_data?.contract?.[0]?.parameter?.value;
  if (!value || value.amount === undefined || !value.to_address) {
    return {
      ok: false,
      reason: 'wrong_recipient',
      detail: { txid, message: 'Transaction is not a TRX transfer.' },
    };
  }

  const paymentHex = base58ToHexLocal(order.payment_address).toLowerCase();
  const toHex = value.to_address.toLowerCase();
  if (toHex !== paymentHex) {
    return {
      ok: false,
      reason: 'wrong_recipient',
      detail: { txid, expected: paymentHex, actual: toHex },
    };
  }

  const expectedSun = BigInt(order.trx_amount_sun);
  if (BigInt(value.amount) !== expectedSun) {
    return {
      ok: false,
      reason: 'wrong_amount',
      detail: { txid, expected: expectedSun.toString(), actual: String(value.amount) },
    };
  }

  // Confirmations: current block height minus the tx block.
  const nowBlockRes = await fetchFn(`${TRONGRID}/wallet/getnowblock`, {
    headers: trongridHeaders(),
    cache: 'no-store',
  });
  const nowBlock = (await nowBlockRes.json()) as {
    block_header?: { raw_data?: { number?: number } };
  };
  const currentBlock = nowBlock.block_header?.raw_data?.number;
  const confirmations =
    tx.blockNumber !== undefined && currentBlock !== undefined
      ? Math.max(0, currentBlock - tx.blockNumber)
      : 0;

  if (tx.confirmed !== true || confirmations < TXID_CONFIRMATIONS_REQUIRED) {
    return {
      ok: false,
      reason: 'not_confirmed',
      detail: { txid, confirmations, required: TXID_CONFIRMATIONS_REQUIRED },
    };
  }

  return { ok: true, fromHex: value.owner_address || null, confirmations };
}
