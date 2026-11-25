// Unit tests for lib/settings-validate.ts (admin settings validation +
// order-delete rules) — run with: npm test
// (node --test tests/). Node 22+ can import .ts files directly (type
// stripping); the lib uses only erasable TypeScript and imports nothing,
// so no build step is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSettings,
  canDeleteOrder,
  DELETABLE_ORDER_STATUSES,
  type SettingsValues,
} from '../src/lib/settings-validate.ts';

const VALID: SettingsValues = {
  trxRate: 3.5,
  minBuyUsdt: 1000,
  maxBuyUsdt: 100000,
  expiryMinutes: 30,
  trxPaymentAddress: 'TJjsSanss8wmWgz6jn2MCD7nZKZSwo3szT',
  usdtHotWalletAddress: '',
  supportUsername: 'YourSupport',
  autoSendUsdt: false,
  maxAutoSendUsdt: 5000,
};

// --- validateSettings --------------------------------------------------------
test('validateSettings: valid settings pass', () => {
  assert.deepEqual(validateSettings(VALID), { ok: true });
});

test('validateSettings: empty wallet addresses are allowed (not configured yet)', () => {
  assert.deepEqual(validateSettings({ ...VALID, trxPaymentAddress: '', usdtHotWalletAddress: '' }), { ok: true });
});

test('validateSettings: rate 0 rejected', () => {
  const r = validateSettings({ ...VALID, trxRate: 0 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /greater than 0/);
});

test('validateSettings: negative rate rejected', () => {
  assert.equal(validateSettings({ ...VALID, trxRate: -1 }).ok, false);
});

test('validateSettings: min buy below 100 rejected', () => {
  const r = validateSettings({ ...VALID, minBuyUsdt: 99 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /at least 100/);
});

test('validateSettings: min buy of exactly 100 passes', () => {
  assert.equal(validateSettings({ ...VALID, minBuyUsdt: 100 }).ok, true);
});

test('validateSettings: max must be greater than min', () => {
  assert.equal(validateSettings({ ...VALID, maxBuyUsdt: 1000 }).ok, false);
  assert.equal(validateSettings({ ...VALID, maxBuyUsdt: 999 }).ok, false);
  assert.equal(validateSettings({ ...VALID, minBuyUsdt: 5000, maxBuyUsdt: 10000 }).ok, true);
});

test('validateSettings: expiry below 5 minutes rejected', () => {
  const r = validateSettings({ ...VALID, expiryMinutes: 4 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /at least 5/);
});

test('validateSettings: expiry of exactly 5 passes', () => {
  assert.equal(validateSettings({ ...VALID, expiryMinutes: 5 }).ok, true);
});

test('validateSettings: bad TRX payment address rejected, good one passes', () => {
  assert.equal(validateSettings({ ...VALID, trxPaymentAddress: 'not-an-address' }).ok, false);
  assert.equal(validateSettings({ ...VALID, trxPaymentAddress: 'TJjsSanss8wmWgz6jn2MCD7nZKZSwo3szT' }).ok, true);
  // 33 chars (too short) rejected
  assert.equal(validateSettings({ ...VALID, trxPaymentAddress: 'TJjsSanss8wmWgz6jn2MCD7nZKZSwo3sz' }).ok, false);
});

test('validateSettings: bad USDT hot-wallet address rejected', () => {
  assert.equal(validateSettings({ ...VALID, usdtHotWalletAddress: '0x1234' }).ok, false);
});

test('validateSettings: negative max auto-send rejected', () => {
  assert.equal(validateSettings({ ...VALID, maxAutoSendUsdt: -1 }).ok, false);
});

// --- canDeleteOrder ----------------------------------------------------------
test('canDeleteOrder: EXPIRED and FAILED are deletable', () => {
  assert.equal(canDeleteOrder('EXPIRED'), true);
  assert.equal(canDeleteOrder('FAILED'), true);
  assert.deepEqual([...DELETABLE_ORDER_STATUSES].sort(), ['EXPIRED', 'FAILED']);
});

test('canDeleteOrder: paid / in-progress / completed orders are never deletable', () => {
  for (const s of ['AWAITING_PAYMENT', 'TXID_SUBMITTED', 'TRX_RECEIVED', 'TRX_CONFIRMED', 'USDT_SENDING', 'COMPLETED']) {
    assert.equal(canDeleteOrder(s), false, s);
  }
});

test('canDeleteOrder: unknown status is not deletable', () => {
  assert.equal(canDeleteOrder('WHATEVER'), false);
});
