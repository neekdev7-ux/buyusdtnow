'use client';

import { useEffect, useState } from 'react';
import { useTelegram } from '@/lib/useTelegram';
import TelegramGate from '../../components/TelegramGate';
import FooterMenu from '../../components/FooterMenu';

export default function SupportPage() {
  return (
    <TelegramGate>
      <SupportInner />
    </TelegramGate>
  );
}

function SupportInner() {
  const { user, initData } = useTelegram();
  const [supportUsername, setSupportUsername] = useState('YourSupport');
  const [thread, setThread] = useState<Array<{ direction: string; message: string; created_at: string }>>([]);
  const [text, setText] = useState('');
  const [sent, setSent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // No-store: always show the CURRENT support username from the DB.
    fetch('/api/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.supportUsername) setSupportUsername(j.supportUsername);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(`/api/support?telegram_id=${user.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.messages)) setThread(j.messages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function send() {
    if (!text.trim()) return;
    setSent('');
    const res = await fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, message: text.trim() }),
    });
    const j = await res.json();
    if (!res.ok) {
      setSent(j.error || 'Could not send message.');
      return;
    }
    setText('');
    setSent('Message sent to support ✓ — the admin will reply here and by Telegram DM.');
    setThread((t) => [...t, { direction: 'user', message: j.message.message, created_at: j.message.created_at }]);
  }

  return (
    <>
      <div className="wrap">
        <div className="header">
          <div className="logo">
            <span className="trx">TRX</span> → <span className="usdt">USDT</span> Support
          </div>
        </div>
        <p className="subtitle">Message the admin — replies arrive here and by Telegram DM.</p>

        <div className="card">
          <h2><i className="fa fa-headset" aria-hidden="true" /> Your conversation</h2>
          {loading && <p className="subtitle">Loading…</p>}
          {!loading && thread.length === 0 && (
            <p className="subtitle">No messages yet. Send your first message below.</p>
          )}
          {thread.map((m, i) => (
            <div key={i} className="hint" style={{ fontSize: 14, marginBottom: 10, lineHeight: 1.6 }}>
              <b>{m.direction === 'admin' ? 'Support' : 'You'}</b>
              {' · '}
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(m.created_at).toLocaleString()}</span>
              <br />{m.message}
            </div>
          ))}
        </div>

        <div className="card">
          <h2>New message</h2>
          <div className="field">
            <div className="input-row">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Describe your issue… (order ID helps)"
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <button className="paste-btn" onClick={send}>Send</button>
            </div>
            {sent && <div className="hint" style={{ marginTop: 6 }}>{sent}</div>}
            <div className="hint" style={{ marginTop: 8 }}>
              You can also message the bot directly in Telegram, or contact @{supportUsername} — it reaches the same support inbox.
            </div>
          </div>
        </div>
      </div>
      <FooterMenu />
    </>
  );
}
