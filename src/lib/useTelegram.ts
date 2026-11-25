'use client';

import { useEffect, useState } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        initData?: string;
        initDataUnsafe?: {
          user?: { id: number; username?: string; first_name?: string };
        };
        themeParams?: Record<string, string>;
        HapticFeedback?: { impact: (style: string) => void };
      };
    };
  }
}

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TelegramState {
  /** True once we have finished waiting for the Telegram WebApp script. */
  ready: boolean;
  /** True when opened inside Telegram (WebApp object present). */
  inTelegram: boolean;
  /** True when valid initData was exposed (identity comes from Telegram only). */
  hasInitData: boolean;
  user: TgUser | null;
  initData: string;
}

/**
 * Telegram WebApp bootstrap (per telegram_mini_app skill):
 * wait for the Telegram script to expose initData before the app makes any
 * backend call. A direct browser open has no initData and is unsupported —
 * identity comes from Telegram only.
 */
export function useTelegram(): TelegramState {
  const [state, setState] = useState<TelegramState>({
    ready: false,
    inTelegram: false,
    hasInitData: false,
    user: null,
    initData: '',
  });

  useEffect(() => {
    let done = false;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        const initData = tg.initData || '';
        const u = tg.initDataUnsafe?.user;
        setState({
          ready: true,
          inTelegram: true,
          hasInitData: Boolean(initData),
          user: u ? { id: u.id, username: u.username, first_name: u.first_name } : null,
          initData,
        });
        done = true;
        clearInterval(timer);
        return;
      }
      // Script failed to load / not in Telegram after ~5s: give up waiting.
      if (attempts >= 25) {
        setState((s) => ({ ...s, ready: true }));
        done = true;
        clearInterval(timer);
      }
    }, 200);
    return () => {
      if (!done) clearInterval(timer);
    };
  }, []);

  return state;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}
