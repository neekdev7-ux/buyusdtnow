// Unit tests for lib/telegram.ts isTelegramAdmin (used by POST /api/me to
// decide whether the footer menubar shows the Admin tab) — run with:
// npm test (node --test tests/). Node 22+ can import .ts files directly
// (type stripping); the lib imports only node:crypto, so no build step is
// needed. The route itself (src/app/api/me/route.ts) is a thin wrapper
// around this function and is covered by `npm run build` type-checking.
//
// The test signs initData exactly like Telegram does:
//   secret = HMAC-SHA256(key="WebAppData", msg=botToken)
//   hash   = HMAC-SHA256(secret, sorted "key=value" lines) as hex
// Fake token / ids only — never the real bot token or admin id.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isTelegramAdmin } from '../src/lib/telegram.ts';

const FAKE_TOKEN = 'test-bot-token-123';
const ADMIN_ID = 111222333;
const OTHER_ID = 999888777;

function signInitData(user: { id: number; username?: string }, token: string): string {
  const params = new URLSearchParams();
  params.set('auth_date', '1794112002');
  params.set('user', JSON.stringify(user));
  const pairs: string[] = [];
  params.forEach((value, key) => pairs.push(`${key}=${value}`));
  pairs.sort();
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function withEnv(fn: () => void): void {
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevAdmin = process.env.ADMIN_TELEGRAM_ID;
  process.env.TELEGRAM_BOT_TOKEN = FAKE_TOKEN;
  process.env.ADMIN_TELEGRAM_ID = String(ADMIN_ID);
  try {
    fn();
  } finally {
    if (prevToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prevToken;
    if (prevAdmin === undefined) delete process.env.ADMIN_TELEGRAM_ID;
    else process.env.ADMIN_TELEGRAM_ID = prevAdmin;
  }
}

test('isTelegramAdmin: valid initData for the admin id returns true', () => {
  withEnv(() => {
    assert.equal(isTelegramAdmin(signInitData({ id: ADMIN_ID, username: 'admin' }, FAKE_TOKEN)), true);
  });
});

test('isTelegramAdmin: valid initData for a different user returns false', () => {
  withEnv(() => {
    assert.equal(isTelegramAdmin(signInitData({ id: OTHER_ID, username: 'user' }, FAKE_TOKEN)), false);
  });
});

test('isTelegramAdmin: tampered initData (wrong hash) returns false', () => {
  withEnv(() => {
    const good = signInitData({ id: ADMIN_ID }, FAKE_TOKEN);
    const tampered = good.replace(/hash=[0-9a-f]+/, `hash=${'0'.repeat(64)}`);
    assert.equal(isTelegramAdmin(tampered), false);
  });
});

test('isTelegramAdmin: initData signed with a different bot token returns false', () => {
  withEnv(() => {
    assert.equal(isTelegramAdmin(signInitData({ id: ADMIN_ID }, 'another-token')), false);
  });
});

test('isTelegramAdmin: empty / missing initData returns false', () => {
  withEnv(() => {
    assert.equal(isTelegramAdmin(''), false);
    assert.equal(isTelegramAdmin(null), false);
    assert.equal(isTelegramAdmin(undefined), false);
  });
});

test('isTelegramAdmin: ADMIN_TELEGRAM_ID not configured returns false', () => {
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevAdmin = process.env.ADMIN_TELEGRAM_ID;
  process.env.TELEGRAM_BOT_TOKEN = FAKE_TOKEN;
  delete process.env.ADMIN_TELEGRAM_ID;
  try {
    assert.equal(isTelegramAdmin(signInitData({ id: ADMIN_ID }, FAKE_TOKEN)), false);
  } finally {
    if (prevToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prevToken;
    if (prevAdmin !== undefined) process.env.ADMIN_TELEGRAM_ID = prevAdmin;
  }
});

test('isTelegramAdmin: bot token not configured returns false', () => {
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevAdmin = process.env.ADMIN_TELEGRAM_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
  process.env.ADMIN_TELEGRAM_ID = String(ADMIN_ID);
  try {
    assert.equal(isTelegramAdmin(signInitData({ id: ADMIN_ID }, FAKE_TOKEN)), false);
  } finally {
    if (prevToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = prevToken;
    if (prevAdmin === undefined) delete process.env.ADMIN_TELEGRAM_ID;
    else process.env.ADMIN_TELEGRAM_ID = prevAdmin;
  }
});
