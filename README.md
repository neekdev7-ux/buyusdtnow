# TRX → USDT Exchange — Telegram Mini App

Buy USDT (TRC20) with TRX at a **fixed rate**. The user picks an amount
(minimum 1000 USDT), enters their USDT TRC20 receive address, pays the exact
TRX amount, and receives USDT after the TRX payment is confirmed on-chain
(19 confirmations).

> **No real wallet address, bot token, or private key is in this repo.**
> Every secret is a clearly-marked placeholder in `.env.example` — the admin
> must supply their own values (see [DEPLOY.md](DEPLOY.md)).

## How it works (flow)

```
User (Telegram Mini App)                Server (Next.js API)              TRON
─────────────────────────              ────────────────────              ─────
  GET /api/config
  → fixed rate, min/max, ──────────────► settings (DB/env)
    payment address
  Pick amount (min 1000 USDT)
  Enter USDT TRC20 address
  POST /api/orders/create ─────────────► validate amount + address
    ← order: rate-locked snapshot,       create order (30-min expiry)
       exact TRX amount (6dp) +
       TRX amount in SUN
  Pay page: QR + copy address
  Send exact TRX ───────────────────────────────────────────────► payment wallet
  Poll POST /api/orders/[id]/check ───► TronGrid: find TRX tx to
  (every 15s) + cron once daily         payment address, value ==
                                         trx_amount_sun exactly,
                                         block_timestamp >= created
                                       confirmations = current block
                                         − tx block (need ≥ 19)
    TRX_RECEIVED (<19 conf) → TRX_CONFIRMED (≥19 conf)
       │
       ├─ AUTO_SEND_USDT=true + key set + ≤ MAX_AUTO_SEND_USDT
       │    → triggerSmartContract transfer() on USDT TRC20
       │      (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) → COMPLETED
       │
       └─ DEFAULT (auto-send OFF)
            → order waits in Admin → Pending payouts
              admin sends USDT manually, pastes TXID → COMPLETED
```

Order states: `AWAITING_PAYMENT → TRX_RECEIVED → TRX_CONFIRMED → USDT_SENDING → COMPLETED`
(plus `EXPIRED` after 30 min unpaid, `FAILED` on amount mismatch / admin reject).

### Manual TXID deposit flow

If auto-detection misses a payment (or the user prefers it), the user can
paste the TRX **Transaction ID (TXID)** from TronLink / TronScan on the Pay
page while the order is still `AWAITING_PAYMENT` and the timer is running:

```
User submits TXID (64 hex chars) ──► POST /api/orders/[id]/submit-txid
  → order becomes TXID_SUBMITTED, 30-min timer FREEZES (never expires
    in this state), admin is notified on Telegram
Admin in /admin → Pending TXID review ──► POST /api/admin/orders/[id]/confirm-deposit
  → server verifies the TXID on TronGrid: tx exists + confirmed, transfer
    to the payment address, amount == trx_amount_sun exactly, ≥ 19
    confirmations. On success the order follows the normal confirmed path
    (TRX_CONFIRMED → auto-send USDT if enabled, else payout queue) and the
    user is DM'd "deposit confirmed, USDT payout is next".
  → on failure (not_found / not_confirmed / wrong_recipient / wrong_amount)
    the order is NOT changed; the admin sees the exact reason inline.
Admin rejects instead ──► POST /api/admin/orders/[id]/reject-deposit { reason }
  → order becomes FAILED with the reason stored (admin_review_note) and the
    user is DM'd the reason + asked to contact support with the correct TXID.
```

Notifications (admin alert on submit, user DM on confirm/reject) need
`TELEGRAM_BOT_TOKEN` + `ADMIN_TELEGRAM_ID` set; without them the flow still
works but status is visible in-app only. TXID submission itself verifies the
caller's Telegram `initData` (like order creation) when a bot token is set,
so only the order's owner can submit its TXID.

## Defaults

| Setting | Default | Change in |
|---|---|---|
| Fixed rate | **3.50 TRX per USDT** (1000 USDT = 3500 TRX) | `/admin` or `FIXED_TRX_PER_USDT` |
| Min buy | **1000 USDT** | `/admin` or `MIN_BUY_USDT` |
| Max buy | 100000 USDT | `/admin` or `MAX_BUY_USDT` |
| Order expiry | 30 minutes | `/admin` or `ORDER_EXPIRY_MINUTES` |
| Confirmations required | 19 | `CONFIRMATIONS_REQUIRED` in `src/lib/tron.ts` |
| Auto-send USDT | **OFF** (manual admin payout) | `/admin` + `AUTO_SEND_USDT` |

Market reference shown in the app (snapshot 25 Nov 2026): TRX ≈ $0.308 →
≈ 3.25 TRX per USDT at market. The fixed rate (3.50) is admin-set and may
include a spread — update it when TRX moves (see SECURITY.md).

## Telegram gate, referrals & support (telegram_mini_app skill)

- **Gated on Telegram identity.** The app waits for the Telegram WebApp
  script to expose `initData` before any backend call. A direct browser open
  shows a clear error: open the app from the bot's Mini App button, never the
  direct URL. `/admin` is the only ungated page (admins use a browser).
  When `TELEGRAM_BOT_TOKEN` is set, `POST /api/orders/create` (and support /
  referral endpoints) reject requests without valid `initData` (401).
- **Referrals.** Link format: `t.me/<bot_username>/<app_short_name>?startapp=ref_<TELEGRAM_ID>`
  — never bot-level `?start=` for Mini App referrals (it never reaches the
  app). The Buy page shows the user's link + referral count.
  Webhook fallback: a bot-level `/start ref_CODE` is recorded in
  `pending_referrals` and attached on the user's first app open
  (`POST /api/referrals/attach`).
- **Bot webhook.** `/start` answers with a welcome message + **Open App**
  and **Official Channel** buttons. New joins, TRX-confirmed payments,
  completed payouts, and support messages are forwarded to the admin
  (`ADMIN_TELEGRAM_ID`) on Telegram.
- **Support.** Users message from the Buy page or by DMing the bot; both land
  in the same inbox. The admin replies from `/admin` → Support inbox, and the
  reply is delivered both in the app thread and by Telegram DM.

## Pages

| Page | What it does |
|---|---|
| `/` (Buy) | Rate display, amount chips (1000/2000/5000/10000/20000) + custom input, TRC20 address input with validation + paste, live TRX-to-pay, Create Order |
| `/pay/[id]` | Exact TRX amount, payment address + copy + QR code, 30-min countdown, 15s status polling, TronScan links, "I Have Paid" button, manual TXID submission (timer freezes while under admin review) |
| `/orders` | The user's orders by Telegram ID, with status + TXIDs |
| `/support` | User ↔ admin support conversation (same inbox as the bot DMs) |
| `/admin` | Password login (`ADMIN_PASSWORD`), change rate/wallets/min/max, rate history, stats, pending TXID review (confirm/reject), pending payouts, mark USDT sent (with TXID), reject orders, delete expired/failed orders + support messages |

### Footer menubar (mobile-first)

Every main page has a fixed bottom menubar with Font Awesome 4.7 icon buttons
(CDN stylesheet in `layout.tsx`):

| Tab | Icon | Goes to |
|---|---|---|
| Buy | `fa fa-home` | `/` |
| Orders | `fa fa-list-alt` | `/orders` |
| Support | `fa fa-headset` | `/support` |
| Admin | `fa fa-cog` | `/admin` |

The active tab is highlighted in gold; inactive tabs are muted. The page
container has extra bottom padding so the menubar never covers content
(`.wrap` padding-bottom + `env(safe-area-inset-bottom)` on notched phones).
The menubar is rendered inside each page, not in the root layout, so the
Telegram identity gate screen stays untouched.

### Admin: rate & price management

`/admin` → **Settings** edits every price control and saves to the `settings`
table (DB overrides the env defaults):

- Fixed rate (TRX per USDT), min buy (≥ 100 USDT), max buy (> min),
  order expiry (≥ 5 min), TRX receive wallet, USDT hot-wallet address,
  support username, auto-send toggle + max auto-send.
- Validation runs in the browser **and** on the server (`src/lib/settings-validate.ts`,
  same rules both sides): rate > 0, min ≥ 100, max > min, expiry ≥ 5,
  wallet addresses must be valid TRON addresses when set. A partial save is
  validated against the merged settings, so it can never leave an invalid
  combination.
- **Rate history** — every rate change is logged (old → new, when) in the
  `rate_history` table and listed in `/admin`. It needs the one-time
  migration `supabase-migration-rate-history.sql` (run in Supabase SQL
  Editor); the table is also in `supabase-schema.sql` for fresh installs.
  Without the table the history list simply stays empty — saving settings
  still works.
- **Delete (with confirm):** support messages can be deleted from the inbox;
  orders with status `EXPIRED` or `FAILED` (incl. admin-rejected) can be
  deleted from All orders. Paid / confirmed / completed orders can **never**
  be deleted — the server refuses them (400). Mark-sent (with TXID) and
  reject flows are unchanged. All admin API routes stay behind the existing
  `ADMIN_PASSWORD` HMAC token check.

## API routes

| Route | Purpose |
|---|---|
| `GET /api/config` | Public rate, min/max, payment address, expiry |
| `POST /api/orders/create` | Validate + create rate-locked order (verifies Telegram `initData` HMAC when `TELEGRAM_BOT_TOKEN` is set; otherwise the order is marked `verified: false` — see note below) |
| `GET /api/orders/[id]` | One order (auto-expires on read) |
| `GET /api/orders?telegram_id=…` | A user's orders |
| `POST /api/orders/[id]/check` | Poll TronGrid for this order's payment |
| `POST /api/orders/[id]/submit-txid` | User submits the TRX TXID (64 hex chars) → TXID_SUBMITTED, timer freezes, admin notified (verifies Telegram `initData` when `TELEGRAM_BOT_TOKEN` is set) |
| `GET/POST /api/cron/check-payments` | Cron: check all pending orders + expire stale ones (once daily, `vercel.json`) |
| `POST /api/admin/login` | Admin password → stateless HMAC token |
| `GET /api/admin/settings` | Read settings + rate history (empty when the migration is not run) |
| `POST /api/admin/settings` | Update settings (merged validation; logs rate changes to `rate_history`) |
| `DELETE /api/admin/orders/[id]` | Delete an EXPIRED / FAILED order only (paid/completed refused) |
| `DELETE /api/admin/support/[id]` | Delete one support message |
| `GET /api/admin/orders` | All orders + stats (incl. `txidSubmitted` count) |
| `POST /api/admin/orders/[id]/confirm-deposit` | Admin: verify the submitted TXID on TronGrid (≥ 19 conf, exact address + amount) → confirmed path + user DM |
| `POST /api/admin/orders/[id]/reject-deposit` | Admin: reject a TXID_SUBMITTED order with a reason → FAILED + user DM |
| `POST /api/admin/orders/[id]/mark-sent` | Admin: USDT sent manually, store TXID → COMPLETED |
| `POST /api/admin/orders/[id]/reject` | Admin: reject an order |
| `GET /api/referrals?telegram_id=…` | Referral count + link for a user |
| `POST /api/referrals/attach` | Attach referrer on first app open (startapp or pending fallback) |
| `POST /api/support` / `GET /api/support?telegram_id=…` | Send a support message / read the thread |
| `GET /api/admin/support` | Support inbox (admin) |
| `POST /api/admin/support/[id]/reply` | Admin reply — stored in-app + sent by Telegram DM |
| `POST /api/webhook` | Telegram bot webhook: `/start` (welcome + Open App + Official Channel buttons, pending-referral fallback, new-join alert), `/help`, `/orders`, support DMs |

### Telegram identity note
When `TELEGRAM_BOT_TOKEN` is set, `POST /api/orders/create` verifies the
WebApp `initData` hash (HMAC-SHA256 per Telegram docs, `src/lib/telegram.ts`)
and **rejects** requests without valid `initData` (401) — the app is gated on
Telegram identity (see `TelegramGate`), and a direct browser open cannot
create orders. Without a bot token, `telegram_id` from the request body is
accepted but the response says `verified: false` — set the token before going
live so orders can't be created under someone else's Telegram ID.

## Tech

Next.js 14 + React 18, plain CSS, Supabase Postgres (`@supabase/supabase-js`),
`tronweb` (auto-send only), `qrcode` (payment QR), Vercel Cron. Same layout /
API-route style as the PrismMine app (`~/workspace/prismmine/`).

## Local dev

```bash
cp .env.example .env.local   # fill in your own values
npm install
npm run build
npm run dev                  # http://localhost:3000
npm test                     # node --test unit tests
```

## Docs

- [DEPLOY.md](DEPLOY.md) — Vercel + Supabase setup, env vars, testing
- [BOT_SETUP.md](BOT_SETUP.md) — BotFather steps, Menu Button / Web App, webhook
- [SECURITY.md](SECURITY.md) — keys, rate risk, wrong-address warning
