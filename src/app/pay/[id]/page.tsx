'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { copyText, useTelegram } from '@/lib/useTelegram';
import TelegramGate from '../../../components/TelegramGate';
import FooterMenu from '../../../components/FooterMenu';

interface Order {
  id: string;
  usdt_amount: number;
  trx_rate: number;
  trx_amount: number;
  trx_amount_sun: number | string;
  receive_address: string;
  payment_address: string;
  status: string;
  trx_txid: string | null;
  trx_from: string | null;
  confirmations: number;
  usdt_txid: string | null;
  notes: string | null;
  txid_submitted_at: string | null;
  admin_review_note: string | null;
  expires_at: string;
  created_at: string;
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

export default function PayPage() {
  return (
    <TelegramGate>
      <PayPageInner />
    </TelegramGate>
  );
}

function PayPageInner() {
  const params = useParams();
  const id = String(params.id || '');
  const { initData } = useTelegram();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState('');
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lastChecked, setLastChecked] = useState('');
  const [txidInput, setTxidInput] = useState('');
  const [txidBusy, setTxidBusy] = useState(false);
  const [txidError, setTxidError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${id}`);
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || 'Order not found.');
        return;
      }
      setOrder(j.order);
    } catch {
      setError('Network error loading the order.');
    }
  }, [id]);

  const checkPayment = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/orders/${id}/check`, { method: 'POST' });
      const j = await res.json();
      if (res.ok && j.order) setOrder(j.order);
      setLastChecked(new Date().toLocaleTimeString());
    } catch {
      // keep polling; transient network errors are normal
    } finally {
      setChecking(false);
    }
  }, [id]);

  const submitTxid = useCallback(async () => {
    setTxidError('');
    setTxidBusy(true);
    try {
      const res = await fetch(`/api/orders/${id}/submit-txid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trx_txid: txidInput, initData }),
      });
      const j = await res.json();
      if (!res.ok) {
        setTxidError(j.error || 'Could not submit TXID.');
        return;
      }
      setOrder(j.order);
      setTxidInput('');
    } catch {
      setTxidError('Network error submitting TXID.');
    } finally {
      setTxidBusy(false);
    }
  }, [id, txidInput, initData]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useEffect(() => {
    if (!order) return;
    QRCode.toDataURL(order.payment_address, { width: 220, margin: 1 })
      .then(setQr)
      .catch(() => setQr(''));
  }, [order?.payment_address]);

  // Poll every 15s while the order is still payable / confirming.
  // TXID_SUBMITTED also polls (fetch only) so the admin's confirm/reject
  // shows up — but no auto-check spam: the TXID is already under review.
  useEffect(() => {
    if (!order) return;
    const active = ['AWAITING_PAYMENT', 'TXID_SUBMITTED', 'TRX_RECEIVED', 'TRX_CONFIRMED', 'USDT_SENDING'].includes(order.status);
    if (!active) return;
    const fetchOnly = order.status === 'TXID_SUBMITTED';
    timerRef.current = setInterval(() => {
      fetchOrder();
      if (!fetchOnly) checkPayment();
    }, 15000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [order?.status, fetchOrder, checkPayment]);

  // Countdown ticker.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function copy(label: string, text: string) {
    await copyText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }

  if (error && !order) {
    return (
      <div className="wrap">
        <div className="error-box">{error}</div>
        <a href="/">← Back to Buy</a>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="wrap">
        <p className="subtitle">Loading order…</p>
      </div>
    );
  }

  const expiresMs = new Date(order.expires_at).getTime() - now;
  const expired = expiresMs <= 0 && order.status === 'AWAITING_PAYMENT';
  const mins = Math.max(0, Math.floor(expiresMs / 60000));
  const secs = Math.max(0, Math.floor((expiresMs % 60000) / 1000));
  const confPct =
    order.status === 'COMPLETED' || order.status === 'TRX_CONFIRMED' || order.status === 'USDT_SENDING'
      ? 100
      : Math.min(100, Math.round(((order.confirmations || 0) / 19) * 100));

  return (
    <>
    <div className="wrap">
      <div className="header">
        <div className="logo">
          <span className="trx">TRX</span> → <span className="usdt">USDT</span> Exchange
        </div>
      </div>
      <div className="nav" style={{ marginBottom: 14 }}>
        <a href="/">Buy</a>
        <a href="/orders">My Orders</a>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Order</h2>
          <span className={`status-pill status-${order.status}`}>{STATUS_LABEL[order.status] || order.status}</span>
        </div>
        <div className="mono" style={{ marginTop: 10 }}>ID: {order.id}</div>
        <div className="summary-row" style={{ marginTop: 8 }}>
          <span>You receive</span><b>{Number(order.usdt_amount).toLocaleString()} USDT (TRC20)</b>
        </div>
        <div className="summary-row"><span>Rate</span><b>1 USDT = {order.trx_rate} TRX</b></div>
        <div className="summary-row"><span>Your USDT address</span><b className="mono">{order.receive_address}</b></div>
        {order.usdt_txid && (
          <div className="summary-row">
            <span>USDT TXID</span>
            <b><a href={`https://tronscan.org/#/transaction/${order.usdt_txid}`} target="_blank" rel="noreferrer">View on TronScan ↗</a></b>
          </div>
        )}
        {order.trx_txid && (
          <div className="summary-row">
            <span>TRX TXID</span>
            <b><a href={`https://tronscan.org/#/transaction/${order.trx_txid}`} target="_blank" rel="noreferrer">View on TronScan ↗</a></b>
          </div>
        )}
      </div>

      {order.status === 'AWAITING_PAYMENT' && (
        <div className="card">
          <h2>Pay exactly this amount of TRX</h2>
          <div className="rate-big">{Number(order.trx_amount).toLocaleString()} TRX</div>
          <div className="market-line">
            Send the EXACT amount — a different amount will not be credited automatically.
            ({Number(order.trx_amount_sun).toLocaleString()} SUN)
          </div>
          <h2 style={{ marginTop: 16 }}>To this TRX address</h2>
          {qr && <img className="qr" src={qr} alt="TRX payment address QR code" width={220} height={220} />}
          <div className="addr-box">
            <span className="mono">{order.payment_address}</span>
            <button className="btn-small" onClick={() => copy('addr', order.payment_address)}>
              {copied === 'addr' ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="hint">Time left to pay</div>
            <div className={`countdown${expired ? ' expired' : ''}`}>
              {expired ? 'Expired' : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`}
            </div>
          </div>
          <button className="btn-primary" style={{ marginTop: 14 }} onClick={checkPayment} disabled={checking}>
            {checking ? 'Checking…' : 'I Have Paid — Check Payment'}
          </button>
          {lastChecked && <div className="hint center" style={{ marginTop: 8 }}>Last checked: {lastChecked} · auto-checks every 15s</div>}

          {!expired && (
            <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <h2 style={{ marginTop: 0 }}>Submit Transaction ID (TXID)</h2>
              <div className="hint" style={{ fontSize: 13, marginBottom: 8 }}>
                Already sent the TRX but auto-check has not picked it up? Paste the
                transaction hash here — find it in TronLink / TronScan under
                Transaction Details → Transaction Hash. The admin will verify it
                and the 30-minute timer freezes while it is under review.
              </div>
              <div className="input-row">
                <input
                  value={txidInput}
                  onChange={(e) => setTxidInput(e.target.value)}
                  placeholder="64-character transaction hash (e.g. a1b2c3…)"
                  className="mono"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button className="paste-btn" onClick={submitTxid} disabled={txidBusy || !txidInput.trim()}>
                  {txidBusy ? 'Submitting…' : 'Submit'}
                </button>
              </div>
              {txidError && <div className="hint error" style={{ marginTop: 8 }}>{txidError}</div>}
            </div>
          )}
        </div>
      )}

      {order.status === 'TXID_SUBMITTED' && (
        <div className="card">
          <h2>TXID submitted — waiting for admin check</h2>
          <div className="hint" style={{ fontSize: 13 }}>
            Your transaction ID was submitted{order.txid_submitted_at && (
              <> on {new Date(order.txid_submitted_at).toLocaleString()}</>
            )}. The admin is verifying it on TronGrid.
            <b> The 30-minute timer is frozen</b> while your TXID is under review —
            this order will not expire.
          </div>
          {order.trx_txid && (
            <div className="summary-row" style={{ marginTop: 10 }}>
              <span>Submitted TXID</span>
              <b><a href={`https://tronscan.org/#/transaction/${order.trx_txid}`} target="_blank" rel="noreferrer">View on TronScan ↗</a></b>
            </div>
          )}
          <div className="mono" style={{ marginTop: 8, fontSize: 12, wordBreak: 'break-all' }}>{order.trx_txid}</div>
        </div>
      )}

      {(order.status === 'TRX_RECEIVED' || order.status === 'TRX_CONFIRMED' || order.status === 'USDT_SENDING') && (
        <div className="card">
          <h2>
            {order.status === 'TRX_RECEIVED' && 'TRX received — waiting for confirmations'}
            {order.status === 'TRX_CONFIRMED' && 'TRX confirmed — USDT payout queued'}
            {order.status === 'USDT_SENDING' && 'TRX confirmed — sending your USDT…'}
          </h2>
          <div className="hint" style={{ fontSize: 13 }}>
            Confirmations: {order.confirmations} / 19 required
          </div>
          <div className="progress"><div style={{ width: `${confPct}%` }} /></div>
          {order.status === 'TRX_CONFIRMED' && (
            <div className="hint" style={{ marginTop: 10, fontSize: 13 }}>
              Your payment is confirmed. USDT is sent by the admin (or automatically, if auto-send is enabled) to:{' '}
              <span className="mono">{order.receive_address}</span>
            </div>
          )}
        </div>
      )}

      {order.status === 'COMPLETED' && (
        <div className="card">
          <h2>✓ USDT sent</h2>
          <div className="hint" style={{ fontSize: 13 }}>
            {Number(order.usdt_amount).toLocaleString()} USDT was sent to{' '}
            <span className="mono">{order.receive_address}</span>
            {order.usdt_txid && (
              <> — <a href={`https://tronscan.org/#/transaction/${order.usdt_txid}`} target="_blank" rel="noreferrer">verify on TronScan ↗</a></>
            )}
          </div>
        </div>
      )}

      {(order.status === 'EXPIRED' || order.status === 'FAILED') && (
        <div className="error-box">
          {order.status === 'EXPIRED'
            ? 'This order expired before payment was received. Please create a new order.'
            : 'This order failed. ' + (order.admin_review_note || order.notes || 'Contact support with the order ID.')}
        </div>
      )}

      {order.notes && order.status !== 'FAILED' && (
        <div className="notice">{order.notes}</div>
      )}

      <div className="notice">
        USDT is sent only after your TRX payment is confirmed on-chain (19 confirmations).
        If you paid but the status does not update within a few minutes, contact support with your order ID and TRX TXID.
      </div>
      <a href="/">← Create a new order</a>
    </div>
    <FooterMenu />
    </>
  );
}
