'use client';

import { usePathname } from 'next/navigation';

/**
 * Bottom footer menubar — fixed, always visible, thumb-friendly.
 * Font Awesome 4.7 icons (fa fa-...) loaded via CDN in layout.tsx.
 * The active tab is highlighted in gold; inactive tabs are muted.
 * Rendered inside each main page (Buy / Orders / Support / Admin / Pay)
 * — NOT in the root layout, so the Telegram gate screen stays untouched.
 */
const TABS = [
  { href: '/', label: 'Buy', icon: 'fa fa-home' },
  { href: '/orders', label: 'Orders', icon: 'fa fa-list-alt' },
  { href: '/support', label: 'Support', icon: 'fa fa-headset' },
  { href: '/admin', label: 'Admin', icon: 'fa fa-cog' },
];

export default function FooterMenu() {
  const pathname = usePathname();
  return (
    <nav className="footer-menu" aria-label="Main navigation">
      {TABS.map((t) => {
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
