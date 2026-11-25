# Deploy — TRX → USDT Exchange

## 1. Supabase (database)

1. Create a project at https://supabase.com (free tier is fine).
2. Open **SQL Editor** → paste the whole `supabase-schema.sql` → Run.
   It creates `settings` and `orders` tables + indexes + default settings
   (rate 3.50, min 1000, max 100000, expiry 30 min).
3. Copy from **Settings → API**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` key (secret) → `SUPABASE_SERVICE_ROLE_KEY`
     (the `anon` key is NOT enough — the API uses the service role server-side).

## 2. Vercel (hosting)

1. Push this folder to a GitHub repo, then **Import** it in Vercel
   (or `vercel` CLI from this folder).
2. Framework preset: **Next.js**. No build-command changes needed
   (`npm run build`).
3. Set these **Environment Variables** in Vercel → Project → Settings →
   Environment Variables (all values are yours — never commit them):

| Variable | Required | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | your Supabase service_role key |
| `TELEGRAM_BOT_TOKEN` | yes* | bot token from @BotFather (see BOT_SETUP.md) |
| `NEXT_PUBLIC_APP_URL` | yes | your Vercel URL, e.g. `https://trx-usdt-xxx.vercel.app` |
| `TELEGRAM_BOT_USERNAME` | for referrals | bot username without @, e.g. `YourTrxUsdtBot` |
| `TELEGRAM_APP_SHORT_NAME` | for referrals | Mini App short name from `/newapp` |
| `OFFICIAL_CHANNEL_USERNAME` | no | official channel without @ — shown as a button in `/start` |
| `ADMIN_TELEGRAM_ID` | recommended | your Telegram user ID — new-join, payment, payout + support alerts |
| `TRX_PAYMENT_ADDRESS` | yes | **your** TRX wallet that receives customer payments (public address, starts with T) |
| `USDT_HOT_WALLET_ADDRESS` | yes | **your** USDT TRC20 hot wallet that sends USDT (public address) |
| `ADMIN_PASSWORD` | yes | a strong password for `/admin` |
| `FIXED_TRX_PER_USDT` | no | default `3.50` — change when TRX moves |
| `MIN_BUY_USDT` | no | default `1000` |
| `MAX_BUY_USDT` | no | default `100000` |
| `ORDER_EXPIRY_MINUTES` | no | default `30` |
| `SUPPORT_USERNAME` | no | your Telegram username without @ |
| `AUTO_SEND_USDT` | no | default `false` — keep off unless you read SECURITY.md |
| `MAX_AUTO_SEND_USDT` | no | default `5000` — cap per auto-sent order |
| `USDT_HOT_WALLET_PRIVATE_KEY` | only if auto-send | hot-wallet private key — env only, never in code/chat |
| `CRON_SECRET` | recommended | random string; Vercel Cron calls `/api/cron/check-payments` |
| `TRONGRID_API_KEY` | no | raises TronGrid rate limits (free at trongrid.io) |

\* The app runs without `TELEGRAM_BOT_TOKEN`, but orders are then created
with `verified: false` (Telegram identity unverified). Set it before going live.

4. Deploy. Vercel Cron is already configured in `vercel.json`
   (`/api/cron/check-payments` once daily at 00:00 UTC — the Hobby plan
   allows only daily crons). The 15-second in-app polling on the Pay page
   still checks payments while the user waits, users can submit their TXID,
   and the admin can re-check from `/admin`.
   If you set `CRON_SECRET`, the cron URL must carry it — Vercel Cron cannot
   send a custom header, so use `?secret=YOUR_CRON_SECRET` in the cron path
   in `vercel.json` (keep the secret random and never share it).

## 3. Telegram bot

See [BOT_SETUP.md](BOT_SETUP.md): create the bot, attach this app as a Web
App (Menu Button or `/newapp`), set the webhook to
`https://YOUR_APP.vercel.app/api/webhook`.

## 4. Test before going live

1. Open the app URL in a browser (or Telegram). The Buy page should show
   `1 USDT = 3.50 TRX`.
2. **Test order:** the minimum buy is 1000 USDT, so test with a real amount
   only after you are confident. Safer path: in `/admin`, temporarily lower
   **Min buy** to e.g. `1`, create a 1 USDT order, pay the exact TRX
   (rate × 1), watch it go `AWAITING_PAYMENT → TRX_RECEIVED → TRX_CONFIRMED`,
   then mark it sent manually (or let auto-send run if enabled). Then restore
   Min buy to `1000`.
3. Check `/admin` → pending payouts shows the confirmed order, and
   TronScan links work.
4. **Test the manual TXID flow:** on a fresh order, paste the TRX TXID on
   the Pay page → status becomes `TXID_SUBMITTED`, the countdown disappears
   (timer frozen) and the order does not expire. In `/admin` → Pending TXID
   review, **Confirm Deposit** verifies it on TronGrid and moves the order
   to `TRX_CONFIRMED` (or `COMPLETED` with auto-send); a wrong TXID shows
   the exact reason (`not_found` / `wrong_amount` / `wrong_recipient` /
   `not_confirmed`) and leaves the order unchanged. **Reject** with a reason
   sets the order to `FAILED` and shows the reason on the Pay page.
   Notifications for this flow need `TELEGRAM_BOT_TOKEN` +
   `ADMIN_TELEGRAM_ID`; without them the flow works but status is in-app only.
5. Verify a wrong-amount payment is NOT credited: send a different TRX
   amount to the payment address — the order must go to `FAILED` with an
   amount-mismatch note.
6. If Supabase env is missing, every API route returns a clear 500
   `Supabase not configured — see DEPLOY.md` (no fake data is ever served).

## 5. Going live checklist

- [ ] Supabase schema run, keys set
- [ ] `TRX_PAYMENT_ADDRESS` is YOUR wallet (double-check the address)
- [ ] `USDT_HOT_WALLET_ADDRESS` is YOUR hot wallet, funded with USDT + TRX for fees
- [ ] `ADMIN_PASSWORD` is strong and private
- [ ] `TELEGRAM_BOT_TOKEN` set, webhook set, `/start` shows the Open App + Official Channel buttons
- [ ] Referral link tested with a fresh account (`?startapp=ref_<ID>` records the referrer once)
- [ ] Direct browser open of the app URL shows the "open from Telegram" error (gate works)
- [ ] Fixed rate reviewed against the current TRX market price
- [ ] Test order completed end-to-end (see §4)
- [ ] Manual TXID flow tested end-to-end (see §4 step 4) — admin knows to
  check `/admin` → Pending TXID review; TXID_SUBMITTED orders never expire
  while under review
- [ ] Auto-send decision made (default OFF = manual payout; see SECURITY.md)
