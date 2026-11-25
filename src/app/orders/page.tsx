'use client';

import { useEffect, useState } from 'react';
import { useTelegram } from '@/lib/useTelegram';
import TelegramGate from '../../components/TelegramGate';

interface Order {
  id: string;
  usdt_amount: number;
  trx_amount: number;
  status: string;
  trx_txid: string | null;
  usdt_txid: string | null;
  txid_submitted_at: string | null;
  created_at: string;
  expires_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  TXID_SUBMITTED: 'TXID submitted — waiting for admin check',
  TRX_RECEIVED: 'TRX received — confirming',
  TRX_CONFIRMED: 'TRX confirmed — USDT payout queued',
  USDT_SENDING: 'Sending USDT…',
  COMPLETED: 'Completed',
  EXPIRED: 'Expired',
  FAILED: 'Failed',
};

export default function MyOrdersPage() {
  return (
    <TelegramGate>
      <MyOrdersInner />
    </TelegramGate>
  );
}

function MyOrdersInner() {
  const { user } = useTelegram();
  const [telegramId, setTelegramId] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) setTelegramId(String(user.id));
  }, [user]);

  async function load(id: string) {
    if (!id.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/orders?telegram_id=${encodeURIComponent(id.trim())}`);
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || 'Could not load orders.');
        setOrders([]);
      } else {
        setOrders(j.orders || []);
      }
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (telegramId) load(telegramId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramId]);

  return (
    <div className="wrap">
      <div className="header">
        <div className="logo">
          <span className="trx">TRX</span> → <span className="usdt">USDT</span> Exchange
        </div>
      </div>
      <div className="nav" style={{ marginBottom: 14 }}>
        <a href="/">Buy</a>
        <a href="/orders" className="active">My Orders</a>
      </div>
      <p className="subtitle">Your orders, newest first.</p>

      {!user && (
        <div className="card">
          <h2>Find my orders</h2>
          <div className="field">
            <label>Your Telegram user ID</label>
            <div className="input-row">
              <input
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                placeholder="e.g. 123456789"
                inputMode="numeric"
              />
              <button className="paste-btn" onClick={() => load(telegramId)}>Load</button>
            </div>
            <div className="hint">Open this app inside Telegram and your orders load automatically.</div>
          </div>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}
      {loading && <p className="subtitle">Loading…</p>}
      {!loading && telegramId && orders.length === 0 && !error && (
        <div className="card"><p className="subtitle" style={{ margin: 0 }}>No orders yet.</p></div>
      )}

      {orders.map((o) => (
        <div className="card" key={o.id}>
          <div className="order-row" style={{ borderBottom: 'none', padding: 0 }}>
            <div className="top">
              <b>{Number(o.usdt_amount).toLocaleString()} USDT</b>
              <span className={`status-pill status-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>
            </div>
            <div className="meta">
              Pay: {Number(o.trx_amount).toLocaleString()} TRX<br />
              Created: {new Date(o.created_at).toLocaleString()}<br />
              {o.status === 'TXID_SUBMITTED' && o.txid_submitted_at && (
                <>TXID submitted: {new Date(o.txid_submitted_at).toLocaleString()}<br /></>
              )}
              <a href={`/pay/${o.id}`}>View order →</a>
              {o.trx_txid && (
                <> · <a href={`https://tronscan.org/#/transaction/${o.trx_txid}`} target="_blank" rel="noreferrer">TRX TX ↗</a></>
              )}
              {o.usdt_txid && (
                <> · <a href={`https://tronscan.org/#/transaction/${o.usdt_txid}`} target="_blank" rel="noreferrer">USDT TX ↗</a></>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
