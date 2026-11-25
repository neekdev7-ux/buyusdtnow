// Unit tests for lib/tron.ts — run with: npm test   (node --test tests/)
// Node 22+ can import .ts files directly (type stripping); lib/tron.ts uses
// only erasable TypeScript, so no build step is needed for these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcTrxAmount,
  isValidTrc20Address,
  trxToSun,
  sunToTrx,
  orderExpiry,
  isExpired,
  base58ToHex,
  USDT_TRC20_CONTRACT,
} from '../src/lib/tron.ts';

// --- calcTrxAmount -----------------------------------------------------------
test('calc: 1000 USDT @ 3.50 = 3500 TRX', () => {
  const r = calcTrxAmount(1000, 3.5);
  assert.equal(r.trx, 3500);
  assert.equal(r.sun, 3500000000n);
});

test('calc: 2500 USDT @ 3.50 = 8750 TRX', () => {
  const r = calcTrxAmount(2500, 3.5);
  assert.equal(r.trx, 8750);
  assert.equal(r.sun, 8750000000n);
});

test('calc: rounds to 6 decimals (1000 USDT @ 3.333333 = 3333.333 TRX)', () => {
  const r = calcTrxAmount(1000, 3.333333);
  assert.equal(r.trx, 3333.333);
  assert.equal(r.sun, 3333333000n);
});

test('calc: rejects non-positive amount / rate', () => {
  assert.throws(() => calcTrxAmount(0, 3.5));
  assert.throws(() => calcTrxAmount(1000, 0));
  assert.throws(() => calcTrxAmount(-5, 3.5));
});

// --- address validation ------------------------------------------------------
const VALID = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // the real USDT TRC20 contract
test('address: valid 34-char T address passes', () => {
  assert.equal(isValidTrc20Address(VALID), true);
  assert.equal(VALID.length, 34);
});

test('address: 0x Ethereum address fails', () => {
  assert.equal(isValidTrc20Address('0xdAC17F958D2ee523a2206206994597C13D831ec7'), false);
});

test('address: too short fails', () => {
  assert.equal(isValidTrc20Address('TR7NHqjeKQxGTCi8q8ZY4pL8otS'), false);
});

test('address: lowercase t fails', () => {
  assert.equal(isValidTrc20Address('tR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'), false);
});

test('address: forbidden base58 chars (0, O, I, l) fail', () => {
  assert.equal(isValidTrc20Address('T07NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'), false); // 0
  assert.equal(isValidTrc20Address('TO7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'), false); // O
  assert.equal(isValidTrc20Address('TI7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'), false); // I
  assert.equal(isValidTrc20Address('Tl7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'), false); // l
});

test('address: empty / whitespace fails', () => {
  assert.equal(isValidTrc20Address(''), false);
  assert.equal(isValidTrc20Address('   '), false);
});

// --- SUN conversion exactness ------------------------------------------------
test('sun: 1 TRX = 1,000,000 SUN exactly', () => {
  assert.equal(trxToSun(1), 1000000n);
  assert.equal(trxToSun('3.5'), 3500000n);
  assert.equal(trxToSun('0.000001'), 1n);
});

test('sun: round-trip is exact', () => {
  for (const s of ['3500', '8750.25', '0.000001', '123456.789012']) {
    assert.equal(sunToTrx(trxToSun(s)), s);
  }
});

test('sun: more than 6 decimals throws', () => {
  assert.throws(() => trxToSun('1.0000001'));
});

// --- expiry ------------------------------------------------------------------
test('expiry: orderExpiry adds minutes; isExpired works', () => {
  const created = new Date('2026-11-25T10:00:00Z');
  const exp = orderExpiry(created, 30);
  assert.equal(exp.toISOString(), '2026-11-25T10:30:00.000Z');
  assert.equal(isExpired(exp, new Date('2026-11-25T10:29:59Z')), false);
  assert.equal(isExpired(exp, new Date('2026-11-25T10:30:00Z')), true);
});

// --- base58 -> hex -----------------------------------------------------------
test('base58ToHex: USDT contract address decodes to known hex', () => {
  // TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t -> 41a614f803b6fd780986a42c78ec9c7f77e6ded13c (version 0x41 + 20 bytes)
  assert.equal(base58ToHex(VALID), 'a614f803b6fd780986a42c78ec9c7f77e6ded13c');
});

test('base58ToHex: invalid char throws', () => {
  assert.throws(() => base58ToHex('T0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'));
});

// --- constants ---------------------------------------------------------------
test('USDT TRC20 contract is the real mainnet contract', () => {
  assert.equal(USDT_TRC20_CONTRACT, 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
});
