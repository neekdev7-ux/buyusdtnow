'use client';

import { usePathname } from 'next/navigation';
import { useTelegram } from '@/lib/useTelegram';
import { useIsAdmin } from '@/lib/useIsAdmin';

/**
 * Bottom footer menubar — fixed, always visible, thumb-friendly.
 * Font Awesome 4.7 icons (fa fa-...) loaded via CDN in layout.tsx.
 * The active tab is highlighted in gold; inactive tabs are muted.
 * Rendered inside each main page (Buy / Orders / Support / Admin / Pay)
 * — NOT in the root layout, so the Telegram gate screen stays untouched.
 *
 * The Admin tab is shown ONLY to the admin: POST /api/me verifies the
 * current Telegram initData server-side and compares the user id to
 * ADMIN_TELEGRAM_ID (server env). While that check is loading the tab
 * stays hidden — it never flashes for regular users. `forceShowAdmin` is
 * for the /admin page itself after password login (opened in a browser,
 * where there is no Telegram initData to check).
 */
const BASE_TABS = [
  { href: '/', label: 'Buy', icon: 'fa fa-home' },
  { href: '/orders', label: 'Orders', icon: 'fa fa-list-alt' },
  { href: '/support', label: 'Support', icon: 'fa fa-headset' },
];

const ADMIN_TAB = { href: '/admin', label: 'Admin', icon: 'fa fa-cog' };

export default function FooterMenu({ forceShowAdmin = false }: { forceShowAdmin?: boolean }) {
  const pathname = usePathname();
  const { initData } = useTelegram();
  const isAdmin = useIsAdmin(initData) || forceShowAdmin;
  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;
  return (
    <nav className="footer-menu" aria-label="Main navigation">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <a
            key={t.href}
            href={t.href}
            className={active ? 'footer-tab active' : 'footer-tab'}
            aria-current={active ? 'page' : undefined}
          >
            <i className={t.icon} aria-hidden="true" />
            <span>{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
