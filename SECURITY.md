# Security Notes

## Private keys — the hard rules

- The USDT hot-wallet **private key** lives ONLY in the server env var
  `USDT_HOT_WALLET_PRIVATE_KEY`. It is never in this repo, never in the
  database, never shown in the admin UI, and never logged. The auto-send
  code (`src/lib/orders.ts` → `sendUsdt`) throws before doing anything if
  the key is missing.
- Never paste a private key, seed phrase, or bot token in chat, screenshots,
  or issues. If one leaks, move the funds and rotate the key immediately.
- `ADMIN_PASSWORD` and `CRON_SECRET` are env-only too. Rotate the admin
  password by changing the env var (the admin token is a stateless HMAC of
  it, so old tokens stop working at once).

## Auto-send (USDT) — default OFF, for a reason

- Auto-send moves real USDT from your hot wallet the moment a TRX payment
  confirms. It is OFF by default; the safe mode is **manual payout** — the
  admin checks the order in `/admin` and sends USDT by hand, then pastes the
  TXID.
- If you enable it: set `AUTO_SEND_USDT=true`, set the private key env, keep
  `MAX_AUTO_SEND_USDT` low (default 5000), and keep only a small USDT
  balance in the hot wallet. The code refuses any auto-send above the cap.
- The hot wallet needs TRX as well as USDT — every TRC20 transfer burns TRX
  for energy/bandwidth fees.

## Fixed-rate risk

- The rate is **fixed** (default 3.50 TRX/USDT) and does NOT track the market.
  Market on 25 Nov 2026: TRX ≈ $0.308 → ≈ 3.25 TRX/USDT. If TRX rises, you
  overpay users in USDT terms; if it falls, users overpay you. **Check the
  TRX price and update the rate in `/admin` regularly.** There is no
  automatic repricing.
- No guaranteed-return or "profit" claims are made anywhere in this app.
  Never promise a user a return — this is a straight currency exchange.

## Payment matching

- A payment is credited ONLY when a TRX transfer to your payment address has
  the **exact** SUN value of the order (`trx_amount_sun`) and a block
  timestamp at or after the order was created. A wrong amount is recorded as
  `FAILED` with an amount-mismatch note and is never credited automatically.
- USDT is released only after **19 confirmations** of the TRX payment.
- One order = one payment. If a user sends TRX twice, the second transfer is
  not matched to any order — handle it manually (refund or credit by hand).

## Wrong receive address = loss

- The user types their own USDT TRC20 address. The app validates the format
  (`^T[1-9A-HJ-NP-Za-km-z]{33}$`) but **cannot** check that the address
  belongs to the user. If they paste the wrong address, the USDT goes there
  and cannot be recovered. The UI warns about this on the Buy page — keep
  that warning in place.

## Other

- The Telegram `initData` check (HMAC-SHA256) only works when
  `TELEGRAM_BOT_TOKEN` is set. Without it, orders are created with
  `verified: false` — set the token before going live.
- The cron endpoint is protected by `CRON_SECRET` when set; without it, the
  endpoint is callable by anyone (it only reads TronGrid and updates order
  statuses — no funds move except the auto-send path, which is off by
  default).
- Supabase `service_role` key is server-side only. Never put it in
  `NEXT_PUBLIC_*` vars or client code.
