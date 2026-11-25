// Unit tests for lib/txid.ts (manual TXID deposit flow) — run with: npm test
// (node --test tests/). Node 22+ can import .ts files directly (type
// stripping); lib/txid.ts uses only erasable TypeScript and imports nothing,
// so no build step is needed. The TronGrid check is tested with a mocked
// fetch injected as a parameter — never a live network call.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTxid,
  canSubmitTxid,
  verifyTrxTxOnTronGrid,
  base58ToHexLocal,
  TXID_CONFIRMATIONS_REQUIRED,
} from '../src/lib/txid.ts';
import type { TxFetch } from '../src/lib/txid.ts';
import { base58ToHex, CONFIRMATIONS_REQUIRED } from '../src/lib/tron.ts';

// --- validateTxid ------------------------------------------------------------
const GOOD = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
assert.equal(GOOD.length, 64);

test('validateTxid: valid 64-hex passes, lowercased', () => {
  const r = validateTxid(GOOD);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.txid, GOOD);
});

test('validateTxid: uppercase hex passes and normalizes to lowercase', () => {
  const upper = GOOD.toUpperCase();
  const r = validateTxid(upper);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.txid, GOOD);
});

test('validateTxid: 63 chars rejected', () => {
  const r = validateTxid(GOOD.slice(0, 63));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /64/);
});

test('validateTxid: 65 chars rejected', () => {
  const r = validateTxid(GOOD + 'a');
  assert.equal(r.ok, false);
});

test('validateTxid: 0x prefix rejected', () => {
  const r = validateTxid('0x' + GOOD);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /0x/);
});

test('validateTxid: non-hex chars rejected', () => {
  const r = validateTxid('g'.repeat(64));
  assert.equal(r.ok, false);
  const r2 = validateTxid('zzzz' + GOOD.slice(4));
  assert.equal(r2.ok, false);
});

test('validateTxid: surrounding whitespace is trimmed', () => {
  const r = validateTxid(`  \n${GOOD}\t `);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.txid, GOOD);
});

test('validateTxid: empty string rejected', () => {
  assert.equal(validateTxid('').ok, false);
  assert.equal(validateTxid('   ').ok, false);
});

// --- canSubmitTxid -----------------------------------------------------------
const FUTURE = new Date(Date.now() + 30 * 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

test('canSubmitTxid: valid AWAITING_PAYMENT order with time left is ok', () => {
  assert.deepEqual(canSubmitTxid({ status: 'AWAITING_PAYMENT', expires_at: FUTURE }), { ok: true });
});

test('canSubmitTxid: expired order rejected', () => {
  const r = canSubmitTxid({ status: 'AWAITING_PAYMENT', expires_at: PAST });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /expired/i);
});

test('canSubmitTxid: TXID_SUBMITTED order rejected (already submitted)', () => {
  const r = canSubmitTxid({ status: 'TXID_SUBMITTED', expires_at: FUTURE });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /already been submitted/);
});

test('canSubmitTxid: TRX_CONFIRMED order rejected', () => {
  const r = canSubmitTxid({ status: 'TRX_CONFIRMED', expires_at: FUTURE });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /already confirmed/);
});

test('canSubmitTxid: TRX_RECEIVED / COMPLETED / EXPIRED / FAILED rejected', () => {
  for (const status of ['TRX_RECEIVED', 'USDT_SENDING', 'COMPLETED', 'EXPIRED', 'FAILED']) {
    assert.equal(canSubmitTxid({ status, expires_at: FUTURE }).ok, false, status);
  }
});

// --- verifyTrxTxOnTronGrid (mocked fetch) -------------------------------------
const PAYMENT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // real USDT TRC20 contract addr
const PAYMENT_HEX = 'a614f803b6fd780986a42c78ec9c7f77e6ded13c';
const ORDER = { payment_address: PAYMENT_ADDRESS, trx_amount_sun: 3500000000 };
const TXID = GOOD;

function txDetail(overrides: Record<string, unknown> = {}) {
  return {
    txID: TXID,
    blockNumber: 100,
    confirmed: true,
    raw_data: {
      contract: [
        {
          parameter: {
            value: {
              amount: 3500000000,
              owner_address: '4100000000000000000000000000000000000000',
              to_address: PAYMENT_HEX,
            },
          },
        },
      ],
    },
    ...overrides,
  };
}

/** Mock fetch: TronGrid tx detail + current block height. */
function mockFetch(tx: Record<string, unknown> | null, currentBlock = 120): TxFetch {
  return async (url: string) => {
    if (url.includes('/wallet/getnowblock')) {
      return { ok: true, status: 200, json: async () => ({ block_header: { raw_data: { number: currentBlock } } }) };
    }
    if (url.includes('/v1/transactions/')) {
      return { ok: true, status: 200, json: async () => ({ data: tx === null ? [] : [tx] }) };
    }
    throw new Error(`unexpected url ${url}`);
  };
}

test('verify: matching tx with 20 confirmations is ok', async () => {
  const r = await verifyTrxTxOnTronGrid(TXID, ORDER, mockFetch(txDetail()));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.confirmations, 20);
    assert.equal(r.fromHex, '4100000000000000000000000000000000000000');
  }
});

test('verify: exactly 19 confirmations is ok (boundary)', async () => {
  const r = await verifyTrxTxOnTronGrid(TXID, ORDER, mockFetch(txDetail(), 119));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.confirmations, 19);
});

test('verify: 18 confirmations is not_confirmed', async () => {
  const r = await verifyTrxTxOnTronGrid(TXID, ORDER, mockFetch(txDetail(), 118));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'not_confirmed');
    assert.equal(r.detail?.confirmations, 18);
  }
});

test('verify: unconfirmed tx is not_confirmed', async () => {
  const tx = txDetail({ confirmed: false, blockNumber: undefined });
  const r = await verifyTrxTxOnTronGrid(TXID, ORDER, mockFetch(tx));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'not_confirmed');
});

test('verify: wrong amount is wrong_amount', async () => {
  const tx = txDetail();
  (tx.raw_data as any).contract[0].parameter.value.amount = 3499999999;
  const r = await verifyTrxTxOnTronGrid(TXID, ORDER, mockFetch(tx));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'wrong_amount');
    assert.equal(r.detail?.expected, '3500000000');
  }
});

test('verify: wrong recipient is wrong_recipient', async () => {
  const tx = txDetail();
  (tx.raw_data as any).contract[0].parameter.value.to_address = 'b614f803b6fd780986a42c78ec9c7f77e6ded13c';
  const r = await verifyTrxTxOnTronGrid(TXID, ORDER, mockFetch(tx));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'wrong_recipient');
    assert.equal(r.detail?.expected, PAYMENT_HEX);
  }
});

test('verify: unknown txid is not_found', async () => {
  const r = await verifyTrxTxOnTronGrid(TXID, ORDER, mockFetch(null));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'not_found');
});

// --- cross-checks against lib/tron.ts (txid.ts keeps local copies) -----------
test('base58ToHexLocal matches lib/tron.ts base58ToHex', () => {
  assert.equal(base58ToHexLocal(PAYMENT_ADDRESS), base58ToHex(PAYMENT_ADDRESS));
  assert.equal(base58ToHexLocal(PAYMENT_ADDRESS), PAYMENT_HEX);
});

test('TXID_CONFIRMATIONS_REQUIRED matches lib/tron.ts CONFIRMATIONS_REQUIRED', () => {
  assert.equal(TXID_CONFIRMATIONS_REQUIRED, CONFIRMATIONS_REQUIRED);
  assert.equal(TXID_CONFIRMATIONS_REQUIRED, 19);
});
