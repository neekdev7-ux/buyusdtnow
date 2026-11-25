'use client';

import { useEffect, useState } from 'react';

/**
 * Ask the server (POST /api/me) whether the current Telegram user is the
 * admin. The check is server-side: initData is verified with the bot token
 * and the user id is compared to ADMIN_TELEGRAM_ID in the server env.
 * Defaults to `false` while loading — the Admin tab must never flash for
 * regular users. Returns true only after the server confirms it.
 */
export function useIsAdmin(initData: string): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!initData) return;
    let cancelled = false;
    fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j && j.isAdmin === true) setIsAdmin(true);
      })
      .catch(() => {
        // Offline / server error: stay non-admin. The tab stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [initData]);

  return isAdmin;
}
