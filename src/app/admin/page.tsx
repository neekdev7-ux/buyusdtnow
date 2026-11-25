'use client';

import { useEffect, useState } from 'react';
import FooterMenu from '../../components/FooterMenu';
import { validateSettings, canDeleteOrder } from '@/lib/settings-validate';

interface Order {
  id: string;
  telegram_id: string;
  telegram_username: string | null;
  usdt_amount: number;
  trx_amount: number;
  trx_rate: number;
  receive_address: string;
  status: string;
  trx_txid: string | null;
  usdt_txid: string | null;
  notes: string | null;
  txid_submitted_at: string | null;
  admin_review_note: string | null;
  created_at: string;
  expires_at: string;
}

interface Settings {
  trxRate: number;
  minBuyUsdt: number;
  maxBuyUsdt: number;
  expiryMinutes: number;
  trxPaymentAddress: string;
  usdtHotWalletAddress: string;
  supportUsername: string;
  autoSendUsdt: boolean;
  maxAutoSendUsdt: number;
}

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<{ totalVolumeUsdt: number; pendingPayouts: number; completed: number; awaiting: number; txidSubmitted: number } | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [txidInputs, setTxidInputs] = useState<Record<string, string>>({});
  const [verifyResults, setVerifyResults] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [verifyBusy, setVerifyBusy] = useState<Record<string, boolean>>({});
  const [supportMessages, setSupportMessages] = useState<Array<{ id: string; telegram_id: string; telegram_username: string | null; direction: string; message: string; created_at: string }>>([]);
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [replySent, setReplySent] = useState('');
  const [rateHistory, setRateHistory] = useState<Array<{ id: string; old_rate: number; new_rate: number; created_at: string }>>([]);

  useEffect(() => {
    const savedToken = localStorage.getItem('trx-usdt-admin-token');
    if (savedToken) setToken(savedToken);
  }, []);

  useEffect(() => {
    if (token) loadAll(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function login() {
    setLoginError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const j = await res.json();
    if (!res.ok) {
      setLoginError(j.error || 'Login failed.');
      return;
    }
    localStorage.setItem('trx-usdt-admin-token', j.token);
    setToken(j.token);
  }

  async function loadAll(t: string) {
    const [sRes, oRes] = await Promise.all([
      fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${t}` } }),
      fetch('/api/admin/orders', { headers: { Authorization: `Bearer ${t}` } }),
    ]);
    const s = await sRes.json();
    const o = await oRes.json();
    if (!sRes.ok) {
      setError(s.error || 'Could not load settings.');
      if (sRes.status === 401) {
        localStorage.removeItem('trx-usdt-admin-token');
        setToken('');
      }
      return;
    }
    setSettings(s.settings);
    if (Array.isArray(s.rateHistory)) setRateHistory(s.rateHistory);
    if (oRes.ok) {
      setOrders(o.orders || []);
      setStats(o.stats || null);
    }
    const supRes = await fetch('/api/admin/support', { headers: { Authorization: `Bearer ${t}` } });
    const sup = await supRes.json();
    if (supRes.ok) setSupportMessages(sup.messages || []);
  }

  async function replyToSupport(messageId: string, telegramId: string) {
    const text = (replyInputs[messageId] || '').trim();
    if (!text) {
      setError('Type a reply first.');
      return;
    }
    setError('');
    setReplySent('');
    const res = await fetch(`/api/admin/support/${messageId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error || 'Could not send reply.');
      return;
    }
    setReplyInputs({ ...replyInputs, [messageId]: '' });
    setReplySent(`Reply sent to ${telegramId}${j.delivered ? ' (delivered by Telegram DM ✓)' : ' (saved in-app; Telegram DM failed — user may have blocked the bot)'}`);
    loadAll(token);
  }

  async function saveSettings() {
    if (!settings) return;
    setError('');
    setSaved('');
    const check = validateSettings(settings);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ settings }),
    });
    const j = await res.json();
    if (!res.ok) setError(j.error || 'Could not save settings.');
    else {
      setSaved('Settings saved ✓');
      if (Array.isArray(j.rateHistory)) setRateHistory(j.rateHistory);
    }
  }

  async function deleteOrder(orderId: string) {
    if (!window.confirm('Delete this order permanently? Only expired / failed orders can be deleted — paid or completed orders can never be deleted.')) return;
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await res.json();
    if (!res.ok) setError(j.error || 'Could not delete order.');
    else loadAll(token);
  }

  async function deleteSupportMessage(messageId: string) {
    if (!window.confirm('Delete this support message permanently?')) return;
    const res = await fetch(`/api/admin/support/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await res.json();
    if (!res.ok) setError(j.error || 'Could not delete message.');
    else loadAll(token);
  }

  async function markSent(orderId: string) {
    const usdtTxid = (txidInputs[orderId] || '').trim();
    if (!usdtTxid) {
      setError('Enter the USDT TXID first.');
      return;
    }
    const res = await fetch(`/api/admin/orders/${orderId}/mark-sent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ usdtTxid }),
    });
    const j = await res.json();
    if (!res.ok) setError(j.error || 'Could not mark as sent.');
    else loadAll(token);
  }

  async function reject(orderId: string) {
    const res = await fetch(`/api/admin/orders/${orderId}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await res.json();
    if (!res.ok) setError(j.error || 'Could not reject order.');
    else loadAll(token);
  }

  async function confirmDeposit(orderId: string) {
    setVerifyBusy({ ...verifyBusy, [orderId]: true });
    setError('');
    const res = await fetch(`/api/admin/orders/${orderId}/confirm-deposit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await res.json();
    setVerifyBusy({ ...verifyBusy, [orderId]: false });
    if (!res.ok) {
      setVerifyResults({
        ...verifyResults,
        [orderId]: {
          ok: false,
          text: j.reason
            ? `Verification failed: ${j.reason}${j.detail?.confirmations !== undefined ? ` (${j.detail.confirmations} confirmations, 19 required)` : ''}${j.detail?.expected && j.detail?.actual ? ` — expected ${j.detail.expected}, got ${j.detail.actual}` : ''}. Order unchanged.`
            : (j.error || 'Could not confirm deposit.'),
        },
      });
      return;
    }
    setVerifyResults({
      ...verifyResults,
      [orderId]: {
        ok: true,
        text: `Verified ✓ ${j.verification?.confirmations ?? '?'} confirmations — order is now ${j.order?.status || 'TRX_CONFIRMED'}${j.order?.status === 'COMPLETED' ? ' (USDT auto-sent)' : ' (USDT payout queued)'}.`,
      },
    });
    loadAll(token);
  }

  async function rejectDeposit(orderId: string) {
    const reason = window.prompt('Reason for rejecting this deposit (shown to the user):');
    if (!reason || !reason.trim()) return;
    const res = await fetch(`/api/admin/orders/${orderId}/reject-deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const j = await res.json();
    if (!res.ok) setError(j.error || 'Could not reject deposit.');
    else loadAll(token);
  }

  if (!token) {
    return (
      <>
      <div className="wrap">
        <div className="header">
          <div className="logo"><span className="trx">TRX</span> → <span className="usdt">USDT</span> Admin</div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Admin login</h2>
          <div className="field">
            <label>Admin password (ADMIN_PASSWORD env var)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} />
          </div>
          {loginError && <div className="hint error" style={{ marginTop: 8 }}>{loginError}</div>}
          <button className="btn-primary" style={{ marginTop: 14 }} onClick={login}>Log in</button>
        </div>
      </div>
      <FooterMenu />
      </>
    );
  }

  const pendingPayouts = orders.filter((o) => o.status === 'TRX_CONFIRMED');
  const pendingReview = orders.filter((o) => o.status === 'TXID_SUBMITTED');

  return (
    <>
    <div className="wrap">
      <div className="header">
        <div className="logo"><span className="trx">TRX</span> → <span className="usdt">USDT</span> Admin</div>
        <button className="btn-small" onClick={() => { localStorage.removeItem('trx-usdt-admin-token'); setToken(''); }}>Log out</button>
      </div>
      <div className="nav" style={{ marginBottom: 14 }}>
        <a href="/">Buy</a>
        <a href="/orders">My Orders</a>
      </div>

      {error && <div className="error-box">{error}</div>}
      {saved && <div className="notice" style={{ background: '#06281d', borderColor: '#0d5c40', color: '#7fe0b8' }}>{saved}</div>}

      {stats && (
        <div className="card">
          <h2>Stats</h2>
          <div className="summary-row"><span>Total volume (completed)</span><b>{stats.totalVolumeUsdt.toLocaleString()} USDT</b></div>
          <div className="summary-row"><span>TXIDs awaiting review</span><b>{stats.txidSubmitted}</b></div>
          <div className="summary-row"><span>Pending payouts</span><b>{stats.pendingPayouts}</b></div>
          <div className="summary-row"><span>Completed orders</span><b>{stats.completed}</b></div>
          <div className="summary-row"><span>Awaiting payment</span><b>{stats.awaiting}</b></div>
        </div>
      )}

      {settings && (
        <div className="card">
          <h2>Settings</h2>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Fixed rate — TRX per 1 USDT</label>
            <input type="number" step="0.01" value={settings.trxRate} onChange={(e) => setSettings({ ...settings, trxRate: Number(e.target.value) })} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Min buy (USDT)</label>
            <input type="number" value={settings.minBuyUsdt} onChange={(e) => setSettings({ ...settings, minBuyUsdt: Number(e.target.value) })} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Max buy (USDT)</label>
            <input type="number" value={settings.maxBuyUsdt} onChange={(e) => setSettings({ ...settings, maxBuyUsdt: Number(e.target.value) })} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Order expiry (minutes)</label>
            <input type="number" value={settings.expiryMinutes} onChange={(e) => setSettings({ ...settings, expiryMinutes: Number(e.target.value) })} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>TRX receive wallet (payments go here)</label>
            <input value={settings.trxPaymentAddress} onChange={(e) => setSettings({ ...settings, trxPaymentAddress: e.target.value.trim() })} placeholder="T…" />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>USDT hot-wallet address (USDT is sent from here)</label>
            <input value={settings.usdtHotWalletAddress} onChange={(e) => setSettings({ ...settings, usdtHotWalletAddress: e.target.value.trim() })} placeholder="T…" />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Support Telegram username (without @)</label>
            <input value={settings.supportUsername} onChange={(e) => setSettings({ ...settings, supportUsername: e.target.value.trim() })} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>
              <input
                type="checkbox"
                checked={settings.autoSendUsdt}
                onChange={(e) => setSettings({ ...settings, autoSendUsdt: e.target.checked })}
              />{' '}Auto-send USDT (requires hot-wallet private key in env — see SECURITY.md)
            </label>
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Max auto-send per order (USDT)</label>
            <input type="number" value={settings.maxAutoSendUsdt} onChange={(e) => setSettings({ ...settings, maxAutoSendUsdt: Number(e.target.value) })} />
          </div>
          <button className="btn-primary" onClick={saveSettings}>Save Settings</button>
          <div className="hint" style={{ marginTop: 8 }}>
            Private keys are never shown here and never stored in the database. The hot-wallet
            private key lives only in the server env (USDT_HOT_WALLET_PRIVATE_KEY).
          </div>
        </div>
      )}

      <div className="card">
        <h2><i className="fa fa-history" aria-hidden="true" /> Rate history</h2>
        {rateHistory.length === 0 && (
          <p className="subtitle">No rate changes recorded yet. Every rate change is logged here (old → new).</p>
        )}
        {rateHistory.slice(0, 20).map((h) => (
          <div key={h.id} className="summary-row">
            <span>{new Date(h.created_at).toLocaleString()}</span>
            <b>{Number(h.old_rate)} → {Number(h.new_rate)} TRX / USDT</b>
          </div>
        ))}
        <div className="hint">History needs the `rate_history` table — run supabase-migration-rate-history.sql once (see README). If it is not run yet, this list simply stays empty; saving settings still works.</div>
      </div>

      {pendingReview.length > 0 && (
        <div className="card">
          <h2>🧾 Pending TXID review ({pendingReview.length}) — user submitted a TXID, verify on TronGrid</h2>
          {pendingReview.map((o) => (
            <div key={o.id} className="order-row">
              <div className="top"><b>{Number(o.usdt_amount).toLocaleString()} USDT</b><span className="mono">{o.id.slice(0, 8)}…</span></div>
              <div className="meta">
                User: <span className="mono">@{o.telegram_username || o.telegram_id}</span> ({o.telegram_id})<br />
                TRX to receive: {Number(o.trx_amount).toLocaleString()} TRX · To: <span className="mono">{o.receive_address}</span><br />
                Submitted: {o.txid_submitted_at ? new Date(o.txid_submitted_at).toLocaleString() : '—'} · Timer frozen<br />
                TXID: <span className="mono">{o.trx_txid}</span>{' '}
                <a href={`https://tronscan.org/#/transaction/${o.trx_txid}`} target="_blank" rel="noreferrer">TronScan ↗</a>
              </div>
              <div className="input-row" style={{ marginTop: 8 }}>
                <button className="paste-btn" onClick={() => confirmDeposit(o.id)} disabled={!!verifyBusy[o.id]}>
                  {verifyBusy[o.id] ? 'Verifying…' : 'Confirm Deposit'}
                </button>
                <button className="btn-small" onClick={() => rejectDeposit(o.id)}>Reject</button>
              </div>
              {verifyResults[o.id] && (
                <div className={verifyResults[o.id].ok ? 'notice' : 'error-box'} style={{ marginTop: 8 }}>
                  {verifyResults[o.id].text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingPayouts.length > 0 && (
        <div className="card">
          <h2>⚠ Pending payouts ({pendingPayouts.length}) — TRX confirmed, USDT not sent yet</h2>
          {pendingPayouts.map((o) => (
            <div key={o.id} className="order-row">
              <div className="top"><b>{Number(o.usdt_amount).toLocaleString()} USDT</b><span className="mono">{o.id.slice(0, 8)}…</span></div>
              <div className="meta">
                To: <span className="mono">{o.receive_address}</span><br />
                TRX paid: {Number(o.trx_amount).toLocaleString()} TRX ·{' '}
                <a href={`https://tronscan.org/#/transaction/${o.trx_txid}`} target="_blank" rel="noreferrer">TRX TX ↗</a>
              </div>
              <div className="input-row" style={{ marginTop: 8 }}>
                <input
                  placeholder="Paste USDT TXID after sending"
                  value={txidInputs[o.id] || ''}
                  onChange={(e) => setTxidInputs({ ...txidInputs, [o.id]: e.target.value })}
                />
                <button className="paste-btn" onClick={() => markSent(o.id)}>Mark sent</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {replySent && <div className="notice" style={{ background: '#06281d', borderColor: '#0d5c40', color: '#7fe0b8' }}>{replySent}</div>}

      <div className="card">
        <h2>Support inbox</h2>
        <button className="btn-small" onClick={() => loadAll(token)} style={{ marginBottom: 10 }}>Refresh</button>
        {supportMessages.length === 0 && <p className="subtitle">No support messages yet.</p>}
        {supportMessages.slice(0, 50).map((m) => (
          <div key={m.id} className="order-row">
            <div className="meta">
              <b>{m.direction === 'admin' ? 'You (admin)' : `@${m.telegram_username || m.telegram_id}`}</b>
              {' · '}{new Date(m.created_at).toLocaleString()}
              <br />{m.message}
            </div>
            <div className="input-row" style={{ marginTop: 8 }}>
              {m.direction === 'user' && (
                <>
                  <input
                    placeholder="Reply… (sent in-app + Telegram DM)"
                    value={replyInputs[m.id] || ''}
                    onChange={(e) => setReplyInputs({ ...replyInputs, [m.id]: e.target.value })}
                  />
                  <button className="paste-btn" onClick={() => replyToSupport(m.id, m.telegram_id)}>Reply</button>
                </>
              )}
              <button className="btn-danger" onClick={() => deleteSupportMessage(m.id)}>
                <i className="fa fa-trash" aria-hidden="true" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>All orders</h2>
        <button className="btn-small" onClick={() => loadAll(token)} style={{ marginBottom: 10 }}>Refresh</button>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin">
            <thead>
              <tr><th>Created</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    {new Date(o.created_at).toLocaleString()}<br />
                    <span className="mono">{o.id.slice(0, 8)}…</span><br />
                    <span className="mono">@{o.telegram_username || o.telegram_id}</span>
                  </td>
                  <td>
                    {Number(o.usdt_amount).toLocaleString()} USDT<br />
                    {Number(o.trx_amount).toLocaleString()} TRX @ {o.trx_rate}
                  </td>
                  <td>
                    <span className={`status-pill status-${o.status}`}>{o.status}</span>
                    {o.notes && <div className="hint" style={{ marginTop: 4 }}>{o.notes}</div>}
                    {o.usdt_txid && <div className="hint"><a href={`https://tronscan.org/#/transaction/${o.usdt_txid}`} target="_blank" rel="noreferrer">USDT TX ↗</a></div>}
                  </td>
                  <td>
                    {o.status === 'TRX_CONFIRMED' && (
                      <div className="input-row">
                        <input
                          placeholder="USDT TXID"
                          value={txidInputs[o.id] || ''}
                          onChange={(e) => setTxidInputs({ ...txidInputs, [o.id]: e.target.value })}
                          style={{ width: 130 }}
                        />
                        <button className="btn-small" onClick={() => markSent(o.id)}>Mark sent</button>
                      </div>
                    )}
                    {['AWAITING_PAYMENT', 'TRX_RECEIVED'].includes(o.status) && (
                      <button className="btn-small" onClick={() => reject(o.id)}>Reject</button>
                    )}
                    {canDeleteOrder(o.status) && (
                      <button className="btn-danger" style={{ marginLeft: 6 }} onClick={() => deleteOrder(o.id)}>
                        <i className="fa fa-trash" aria-hidden="true" /> Delete
                      </button>
                    )}
                    <div style={{ marginTop: 6 }}><a href={`/pay/${o.id}`}>View →</a></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {orders.length === 0 && <p className="subtitle">No orders yet.</p>}
      </div>
    </div>
    <FooterMenu forceShowAdmin />
    </>
  );
}
