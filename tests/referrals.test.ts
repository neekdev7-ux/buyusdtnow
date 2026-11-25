// Unit tests for lib/referrals.ts (pure helpers) — run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRefCode } from '../src/lib/referral-links.ts';

test('parseRefCode: ref_123456 -> 123456', () => {
  assert.equal(parseRefCode('ref_123456'), '123456');
});

test('parseRefCode: plain startapp values return null', () => {
  assert.equal(parseRefCode(''), null);
  assert.equal(parseRefCode(null), null);
  assert.equal(parseRefCode(undefined), null);
  assert.equal(parseRefCode('hello'), null);
  assert.equal(parseRefCode('ref_'), null);
  assert.equal(parseRefCode('ref_abc'), null);
  assert.equal(parseRefCode('start_123'), null);
});

test('parseRefCode: trims whitespace', () => {
  assert.equal(parseRefCode('  ref_99  '), '99');
});
