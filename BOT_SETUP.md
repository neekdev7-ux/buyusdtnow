# Telegram Bot Setup

## 1. Create the bot

1. Open Telegram → search **@BotFather** → `/newbot`.
2. Pick a name (e.g. `TRX USDT Exchange`) and a username (must end in `bot`,
   e.g. `@YourTrxUsdtBot`).
3. BotFather replies with a **bot token** — copy it into the env var
   `TELEGRAM_BOT_TOKEN`. Never share it in chat or commit it.

## 2. Attach the Mini App

Option A — **Menu Button** (recommended, one tap from the chat):
1. In @BotFather: `/mybots` → pick your bot → **Bot Settings** → **Menu Button**.
2. Choose **Configure Menu Button**, paste your app URL
   (`https://YOUR_APP.vercel.app`), and a button label like `Buy USDT`.

Option B — **Web App via /newapp**:
1. `/newapp` → pick your bot → title + description → paste the app URL →
   upload an icon if you want.
2. Users open it from the bot's profile / attachment menu.

Either way, the app URL must be exactly `NEXT_PUBLIC_APP_URL`.

## 3. Set the webhook

Replace `<TOKEN>` and `<APP_URL>`:

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/webhook
```

Open that URL in a browser once — Telegram should reply `{"ok":true,...}`.
Check it any time with:

```
https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

(If `getWebhookInfo` shows `pending_update_count` growing, the app URL or
the webhook route is failing — check Vercel logs.)

## 4. What the bot does

| Command / event | Reply |
|---|---|
| `/start` | Welcome text + **Open App** button + **Official Channel** button. A `/start ref_CODE` is recorded as a pending referral (fallback for bot-level links) |
| `/help` | How it works + commands |
| `/orders` | The user's 5 most recent orders (by Telegram ID) |
| Any other DM | Treated as a support message — stored + forwarded to the admin |

The bot never handles money itself — all orders, payments, and payouts go
through the Mini App + API routes.

## 5. Referral links (startapp)

Referral links use the Mini App deep link, **never** bot-level `?start=`:

```
https://t.me/<BOT_USERNAME>/<APP_SHORT_NAME>?startapp=ref_<TELEGRAM_ID>
```

- `<BOT_USERNAME>` = `TELEGRAM_BOT_USERNAME`, `<APP_SHORT_NAME>` =
  `TELEGRAM_APP_SHORT_NAME` (the short name you chose in `/newapp`).
- When a friend opens that link, the app reads `start_param` (`ref_CODE`)
  from `initData` and calls `POST /api/referrals/attach`.
- Fallback: if someone shares a bot-level link `t.me/<BOT>?start=ref_CODE`,
  the webhook records it in `pending_referrals` and the app attaches it on
  first open.
- Test with a fresh account: open the referral link, then check
  `GET /api/referrals?telegram_id=<REFERRER_ID>` — the count must increment
  by 1 and the referrer must be recorded once (re-opening does not duplicate).

## 6. Admin notifications

Set `ADMIN_TELEGRAM_ID` (your Telegram user ID — get it from @userinfobot) to
receive: new joins (`/start`), TRX-confirmed payments, completed payouts
(auto + manual), and support messages. Without it, notifications are skipped
silently — the app still works.

## 7. Test

1. Open the bot in Telegram → `/start` → tap **Buy USDT with TRX**.
2. The app should open full-screen (Telegram WebApp `ready()` + `expand()`).
3. Create an order — your Telegram ID is verified server-side via `initData`
   (HMAC-SHA256) when `TELEGRAM_BOT_TOKEN` is set.
