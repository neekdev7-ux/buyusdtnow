// Regression tests for the two 2026-11-25 bug fixes — run with: npm test
// (node --test tests/). Node 22+ can import .ts files directly (type
// stripping); the pure settings helpers live in src/lib/settings-merge.ts
// (zero imports) precisely so they can be unit-tested this way.
//
// BUG 1 — admin panel changes did not reach the home page: live /api/config
// returned the env defaults (rate 3.5, support YourSupport) while the
// settings table held the admin's values (rate 0.1, support Meekbor).
// The DB read in getSettings() swallowed every error silently, and the
// config response carried a cacheable `Cache-Control: public` header.
// BUG 2 — no user data in the admin panel: there was no users table and no
// user capture anywhere (users existed only implicitly inside orders /
// support_messages), so the admin panel had no user list at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applySettingsRows,
  publicConfig,
  isPaymentAddressConfigured,
  type ExchangeSettings,
} from '../src/lib/settings-merge.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...parts: string[]) => join(ROOT, ...parts);
const read = (f: string) => readFileSync(p(f), 'utf8');

const DEFAULTS: ExchangeSettings = {
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

// --- BUG 1: DB rows must override env defaults --------------------------------

test('applySettingsRows: admin DB values override env defaults (live case)', () => {
  // Exactly the reported live case: table held rate 0.1 + support Meekbor,
  // but the home page showed the defaults 3.5 / YourSupport.
  const merged = applySettingsRows(DEFAULTS, [
    { key: 'trx_rate', value: '0.1' },
    { key: 'support_username', value: 'Meekbor' },
  ]);
  assert.equal(merged.trxRate, 0.1);
  assert.equal(merged.supportUsername, 'Meekbor');
  // Untouched fields keep their defaults.
  assert.equal(merged.minBuyUsdt, 1000);
  assert.equal(merged.maxBuyUsdt, 100000);
  assert.equal(merged.expiryMinutes, 30);
});

test('applySettingsRows: all numeric / string / boolean keys merge', () => {
  const merged = applySettingsRows(DEFAULTS, [
    { key: 'trx_rate', value: '2.5' },
    { key: 'min_buy_usdt', value: '500' },
    { key: 'max_buy_usdt', value: '50000' },
    { key: 'expiry_minutes', value: '15' },
    { key: 'trx_payment_address', value: 'TXYZ12345678901234567890123456789012' },
    { key: 'usdt_hot_wallet_address', value: 'TABC12345678901234567890123456789012' },
    { key: 'auto_send_usdt', value: 'true' },
    { key: 'max_auto_send_usdt', value: '2500' },
  ]);
  assert.equal(merged.trxRate, 2.5);
  assert.equal(merged.minBuyUsdt, 500);
  assert.equal(merged.maxBuyUsdt, 50000);
  assert.equal(merged.expiryMinutes, 15);
  assert.equal(merged.trxPaymentAddress, 'TXYZ12345678901234567890123456789012');
  assert.equal(merged.usdtHotWalletAddress, 'TABC12345678901234567890123456789012');
  assert.equal(merged.autoSendUsdt, true);
  assert.equal(merged.maxAutoSendUsdt, 2500);
});

test('applySettingsRows: unknown keys and invalid numbers are ignored', () => {
  const merged = applySettingsRows(DEFAULTS, [
    { key: 'not_a_setting', value: 'x' },
    { key: 'trx_rate', value: 'not-a-number' },
    { key: 'min_buy_usdt', value: '' },
  ]);
  assert.equal(merged.trxRate, 3.5);
  assert.equal(merged.minBuyUsdt, 1000);
  assert.equal(merged.supportUsername, 'YourSupport');
});

test('applySettingsRows: does not mutate the base settings object', () => {
  const base = { ...DEFAULTS };
  applySettingsRows(base, [{ key: 'trx_rate', value: '0.1' }]);
  assert.equal(base.trxRate, 3.5);
});

test('publicConfig: reflects DB settings, not defaults', () => {
  const cfg = publicConfig({ ...DEFAULTS, trxRate: 0.1, supportUsername: 'Meekbor' });
  assert.equal(cfg.trxRate, 0.1);
  assert.equal(cfg.supportUsername, 'Meekbor');
  assert.equal(cfg.paymentAddress, 'TJjsSanss8wmWgz6jn2MCD7nZKZSwo3szT');
  assert.equal(cfg.paymentAddressConfigured, true);
});

test('isPaymentAddressConfigured: valid TRON address only', () => {
  assert.equal(isPaymentAddressConfigured('TJjsSanss8wmWgz6jn2MCD7nZKZSwo3szT'), true);
  assert.equal(isPaymentAddressConfigured(''), false);
  assert.equal(isPaymentAddressConfigured('not-an-address'), false);
});

// --- BUG 1: the config response must be dynamic + no-store --------------------

test('config route: force-dynamic, revalidate 0, no-store, freshness signal', () => {
  const src = read('src/app/api/config/route.ts');
  assert.ok(src.includes("dynamic = 'force-dynamic'"), 'config route must be force-dynamic');
  assert.ok(src.includes('revalidate = 0'), 'config route must export revalidate = 0');
  assert.ok(src.includes('no-store'), 'config response must carry no-store Cache-Control');
  assert.ok(src.includes('settingsUpdatedAt'), 'config must report settingsUpdatedAt (freshness signal)');
  assert.ok(src.includes('settingsSource'), 'config must report settingsSource (db vs defaults)');
  assert.ok(src.includes('getSettingsWithMeta'), 'config must read settings with meta (DB source tracking)');
});

test('settings lib: DB errors are logged, not silently swallowed', () => {
  const src = read('src/lib/settings.ts');
  assert.ok(src.includes('console.warn'), 'getSettings must log DB read failures');
  assert.ok(src.includes("source: 'defaults'"), 'failed DB read must be reported as defaults source');
  assert.ok(src.includes('getSettingsWithMeta'), 'settings must expose getSettingsWithMeta');
});

test('admin settings save stamps updated_at (freshness signal source)', () => {
  const src = read('src/app/api/admin/settings/route.ts');
  assert.ok(src.includes('updated_at: savedAt'), 'settings save must stamp updated_at on every row');
});

test('home + support pages fetch config with cache no-store', () => {
  for (const f of ['src/app/page.tsx', 'src/app/support/page.tsx']) {
    const src = read(f);
    assert.ok(
      src.includes("fetch('/api/config', { cache: 'no-store' })"),
      `${f} must fetch /api/config with cache: 'no-store'`,
    );
  }
});

test('admin routes: no-store responses', () => {
  for (const f of ['src/app/api/admin/settings/route.ts', 'src/app/api/admin/orders/route.ts', 'src/app/api/admin/users/route.ts']) {
    const src = read(f);
    assert.ok(src.includes('no-store'), `${f} must return no-store responses`);
  }
});

// --- BUG 2: users table + capture + admin list --------------------------------

test('users table exists in schema and migration (with backfill)', () => {
  for (const f of ['supabase-schema.sql', 'supabase-migration-users.sql']) {
    const src = read(f);
    assert.ok(src.includes('create table if not exists users'), `${f} must define the users table`);
    assert.ok(src.includes('telegram_id text primary key'), `${f} must key users by telegram_id`);
    assert.ok(src.includes('first_seen_at'), `${f} must track first_seen_at`);
    assert.ok(src.includes('last_seen_at'), `${f} must track last_seen_at`);
  }
  const mig = read('supabase-migration-users.sql');
  assert.ok(mig.includes('from orders'), 'migration must backfill users from existing orders');
  assert.ok(mig.includes('from support_messages'), 'migration must backfill users from support messages');
});

test('users lib: upsert + list helpers exist and never throw', () => {
  assert.equal(existsSync(p('src/lib/users.ts')), true, 'src/lib/users.ts must exist');
  const src = read('src/lib/users.ts');
  assert.ok(src.includes('export async function upsertUser'), 'users lib must export upsertUser');
  assert.ok(src.includes('export async function listUsers'), 'users lib must export listUsers');
  assert.ok(src.includes("onConflict: 'telegram_id'"), 'upsert must key on telegram_id');
  assert.ok(src.includes('order_count'), 'listUsers must include order counts');
});

test('user capture: webhook /start and order creation record the user', () => {
  const webhook = read('src/app/api/webhook/route.ts');
  assert.ok(webhook.includes('upsertUser'), 'webhook must call upsertUser');
  assert.ok(webhook.includes("from '@/lib/users'"), 'webhook must import users lib');
  const create = read('src/app/api/orders/create/route.ts');
  assert.ok(create.includes('upsertUser'), 'order creation must call upsertUser');
});

test('admin users route + panel list exist', () => {
  assert.equal(existsSync(p('src/app/api/admin/users/route.ts')), true, '/api/admin/users must exist');
  const route = read('src/app/api/admin/users/route.ts');
  assert.ok(route.includes('listUsers'), 'admin users route must use listUsers');
  assert.ok(route.includes('verifyAdminToken'), 'admin users route must stay behind admin auth');
  const page = read('src/app/admin/page.tsx');
  assert.ok(page.includes('/api/admin/users'), 'admin panel must fetch /api/admin/users');
  assert.ok(page.includes('Users ('), 'admin panel must render a Users card');
  assert.ok(page.includes('order_count'), 'admin Users card must show order counts');
});
