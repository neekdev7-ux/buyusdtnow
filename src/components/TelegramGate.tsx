'use client';

import type { ReactNode } from 'react';
import { useTelegram } from '@/lib/useTelegram';

/**
 * Gate for all user-facing pages (per telegram_mini_app skill):
 * - Wait for the Telegram WebApp script to expose initData.
 * - Direct browser open = unsupported: show a clear error telling the user
 *   to open the app from the bot's Mini App button, never the direct URL.
 * The admin page (/admin) is NOT gated — admins open it in a browser.
 */
export default function TelegramGate({ children }: { children: ReactNode }) {
  const tg = useTelegram();

  if (!tg.ready) {
    return (
      <div className="wrap">
        <p className="subtitle">Opening Telegram…</p>
      </div>
    );
  }

  if (!tg.hasInitData) {
    return (
      <div className="wrap">
        <div className="header">
          <div className="logo">
            <span className="trx">TRX</span> → <span className="usdt">USDT</span> Exchange
          </div>
        </div>
        <div className="error-box" style={{ marginTop: 16 }}>
          <b>Please open this app from Telegram.</b>
          <br />
          <br />
          This exchange only works inside Telegram — your identity comes from
          Telegram, and a direct browser link cannot verify who you are.
          <br />
          <br />
          Open the bot in Telegram and tap the <b>Mini App button</b> (menu
          button) to launch the exchange. Do not open the direct website URL.
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
