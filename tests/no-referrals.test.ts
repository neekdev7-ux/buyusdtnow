// Regression tests for the referral-system removal — run with: npm test
// The referral system was removed completely (2026-11-25): no referral
// recording on order creation or app open, no invite UI, no /api/referrals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...parts: string[]) => join(ROOT, ...parts);

test('referral modules and API routes are deleted', () => {
  assert.equal(existsSync(p('src/lib/referrals.ts')), false, 'src/lib/referrals.ts must not exist');
  assert.equal(existsSync(p('src/lib/referral-links.ts')), false, 'src/lib/referral-links.ts must not exist');
  assert.equal(existsSync(p('src/app/api/referrals')), false, 'src/app/api/referrals must not exist');
  assert.equal(existsSync(p('tests/referrals.test.ts')), false, 'tests/referrals.test.ts must not exist');
});

test('no referral strings remain in app code', () => {
  const files = [
    'src/app/api/webhook/route.ts',
    'src/app/api/config/route.ts',
    'src/app/api/orders/create/route.ts',
    'src/app/api/orders/[id]/check/route.ts',
    'src/app/page.tsx',
    'src/lib/useTelegram.ts',
    'src/lib/telegram.ts',
    'src/lib/orders.ts',
  ];
  for (const f of files) {
    const src = readFileSync(p(f), 'utf8');
    for (const needle of ['referral', 'Referral', 'ref_', 'startapp', 'recordPending']) {
      assert.ok(!src.includes(needle), `${f} still mentions ${needle}`);
    }
  }
});

test('config response carries no referral fields', () => {
  const src = readFileSync(p('src/app/api/config/route.ts'), 'utf8');
  assert.ok(!src.includes('referralBaseUrl'), 'config must not return referralBaseUrl');
  assert.ok(!src.includes('appShortName'), 'config must not return appShortName');
  assert.ok(src.includes('botUsername'), 'config must still return botUsername');
});

test('Buy page has no invite UI and makes no referral calls', () => {
  const src = readFileSync(p('src/app/page.tsx'), 'utf8');
  assert.ok(!src.includes('Invite friends'), 'Buy page must not show an invite section');
  assert.ok(!src.includes('/api/referrals'), 'Buy page must not call any referrals endpoint');
  assert.ok(!src.includes('startParam'), 'Buy page must not use startParam');
});

test('webhook /start does not record anything referral-related', () => {
  const src = readFileSync(p('src/app/api/webhook/route.ts'), 'utf8');
  assert.ok(src.includes("text === '/start'"), 'webhook must still handle /start');
  assert.ok(!src.includes('pending_referrals'), 'webhook must not touch pending_referrals');
  assert.ok(!src.includes('via referral'), 'new-join alert must not mention referrals');
});
