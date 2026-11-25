'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTelegram, copyText } from '@/lib/useTelegram';
import TelegramGate from '../components/TelegramGate';
import FooterMenu from '../components/FooterMenu';

const CHIPS = [1000, 2000, 5000, 10000, 20000];
const ADDR_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

interface Config {
  trxRate: number;
  minBuyUsdt: number;
  maxBuyUsdt: number;
  expiryMinutes: number;
  paymentAddress: string;
  paymentAddressConfigured: boolean;
  supportUsername: string;
  telegram?: {
    botUsername: string;
    appShortName: string;
    officialChannel: string;
    referralBaseUrl: string;
  };
}

export default function BuyPage() {
  const router = useRouter();
  const { user, initData, ready, hasInitData, startParam } = useTelegram();
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState('');
  const [amount, setAmount] = useState<number>(1000);
  const [amountText, setAmountText] = useState('1000');
  const [address, setAddress] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [refCount, setRefCount] = useState<number | null>(null);
  const [supportText, setSupportText] = useState('');
  const [supportSent, setSupportSent] = useState('');
  const [supportThread, setSupportThread] = useState<Array<{ direction: string; message: string; created_at: string }>>([]);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setConfigError(j.error);
        else setConfig(j);
      })
      .catch(() => setConfigError('Could not load exchange config. Check your connection.'));
  }, []);

  // Referral attach: on first app open (startapp ref_CODE, or a pending
  // bot-level /start referral recorded by the webhook). Runs only once the
  // Telegram script has exposed initData.
  useEffect(() => {
    if (!ready || !hasInitData || !user) return;
    fetch('/api/referrals/attach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, startParam }),
    }).catch(() => {});
    fetch(`/api/referrals?telegram_id=${user.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (typeof j.count === 'number') setRefCount(j.count);
      })
      .catch(() => {});
    fetch(`/api/support?telegram_id=${user.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.messages)) setSupportThread(j.messages);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasInitData, user?.id]);

  const amountValid =
    Number.isInteger(amount) && config !== null && amount >= config.minBuyUsdt && amount <= config.maxBuyUsdt;
  const addressValid = ADDR_RE.test(address.trim());
  const trxToPay = useMemo(() => {
    if (!config || !amountValid) return null;
    return Math.round(amount * config.trxRate * 1e6) / 1e6;
  }, [amount, amountValid, config]);

  function onAmountText(v: string) {
    setAmountText(v);
    const n = Number(v);
    setAmount(Number.isFinite(n) ? n : 0);
  }

  async function pasteAddress() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setAddress(text.trim());
        setAddressTouched(true);
      }
    } catch {
      setError('Clipboard read blocked — please paste the address manually.');
    }
  }

  async function createOrder() {
    if (!config || !amountValid || !addressValid || creating) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usdtAmount: amount,
          receiveAddress: address.trim(),
          telegramId: user?.id ? String(user.id) : undefined,
          telegramUsername: user?.username,
          initData: initData || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || 'Could not create order.');
        setCreating(false);
        return;
      }
      router.push(`/pay/${j.order.id}`);
    } catch {
      setError('Network error — please try again.');
      setCreating(false);
    }
  }

  async function sendSupport() {
    if (!supportText.trim() || !user) return;
    setSupportSent('');
    const res = await fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, message: supportText.trim() }),
    });
    const j = await res.json();
    if (!res.ok) {
      setSupportSent(j.error || 'Could not send message.');
      return;
    }
    setSupportText('');
    setSupportSent('Message sent to support ✓ — the admin will reply here and by Telegram DM.');
    setSupportThread((t) => [...t, { direction: 'user', message: j.message.message, created_at: j.message.created_at }]);
  }

  const referralLink =
    config?.telegram?.referralBaseUrl && user
      ? `${config.telegram.referralBaseUrl}?startapp=ref_${user.id}`
      : null;

  return (
    <TelegramGate>
    <div className="wrap">
      <div className="header">
        <div className="logo">
          <span className="trx">TRX</span> → <span className="usdt">USDT</span> Exchange
        </div>
      </div>
      <div className="nav" style={{ marginBottom: 14 }}>
        <a href="/" className="active">Buy</a>
        <a href="/orders">My Orders</a>
        <a href="/admin">Admin</a>
      </div>
      <p className="subtitle">Buy USDT (TRC20) with TRX at a fixed rate. Pay TRX — USDT is sent to your wallet after the payment is confirmed on-chain.</p>

      {configError && <div className="error-box">{configError}</div>}

      <div className="card">
        <h2>Fixed rate</h2>
        {config ? (
          <>
            <div className="rate-big">
              1 USDT = {config.trxRate} TRX <small>(fixed)</small>
            </div>
            <div className="market-line">
              Market reference: TRX ≈ $0.308 on 2026-11-25 → ≈ 3.25 TRX per USDT at market.
              The fixed rate above is set by the admin and may include a spread.
            </div>
          </>
        ) : (
          <div className="market-line">Loading rate…</div>
        )}
      </div>

      <div className="card">
        <h2>Amount of USDT</h2>
        <div className="chips">
          {CHIPS.map((c) => (
            <button
              key={c}
              className={`chip${amount === c ? ' selected' : ''}`}
              onClick={() => {
                setAmount(c);
                setAmountText(String(c));
              }}
            >
              {c.toLocaleString()}
            </button>
          ))}
        </div>
        <div className="field">
          <label>Custom amount (whole USDT only)</label>
          <input
            type="number"
            inputMode="numeric"
            min={config?.minBuyUsdt}
            max={config?.maxBuyUsdt}
            step={1}
            value={amountText}
            onChange={(e) => onAmountText(e.target.value)}
          />
          <div className="hint">
            Minimum buy: {config ? config.minBuyUsdt.toLocaleString() : '…'} USDT · Maximum:{' '}
            {config ? config.maxBuyUsdt.toLocaleString() : '…'} USDT
            {!amountValid && amountText !== '' && (
              <span className="hint error"> — enter a whole number within the limits.</span>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Your USDT (TRC20) receive address</h2>
        <div className="field">
          <div className="input-row">
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAddressTouched(true);
              }}
              placeholder="T… (starts with T, 34 characters)"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={addressTouched && address !== '' && !addressValid ? 'invalid' : ''}
            />
            <button className="paste-btn" onClick={pasteAddress}>Paste</button>
          </div>
          <div className={`hint${addressTouched && address !== '' ? (addressValid ? ' ok' : ' error') : ''}`}>
            {addressTouched && address !== ''
              ? addressValid
                ? '✓ Valid TRC20 address.'
                : '✗ Invalid address — must start with T and be 34 characters (TRON base58, no 0 / O / I / l).'
              : 'USDT will be sent to this address. Double-check it — a wrong address means the USDT is lost.'}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Summary</h2>
        <div className="summary-row"><span>You receive</span><b>{amountValid ? `${amount.toLocaleString()} USDT` : '—'}</b></div>
        <div className="summary-row"><span>Fixed rate</span><b>{config ? `1 USDT = ${config.trxRate} TRX` : '—'}</b></div>
        <div className="summary-row"><span>Payment expires in</span><b>{config ? `${config.expiryMinutes} minutes` : '—'}</b></div>
        <div className="summary-row"><span className="total">You pay</span><b className="total">{trxToPay !== null ? `${trxToPay.toLocaleString()} TRX` : '—'}</b></div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <button
        className="btn-primary"
        disabled={!config || !amountValid || !addressValid || creating || !config?.paymentAddressConfigured}
        onClick={createOrder}
      >
        {creating ? 'Creating order…' : trxToPay !== null ? `Create Order — Pay ${trxToPay.toLocaleString()} TRX` : 'Create Order'}
      </button>
      {config && !config.paymentAddressConfigured && (
        <div className="hint error" style={{ marginTop: 8 }}>
          The payment wallet is not configured yet — orders are disabled until the admin sets the TRX receive address.
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <h2>How it works</h2>
        <div className="hint" style={{ fontSize: 13, lineHeight: 1.7 }}>
          1. Choose an amount (min {config ? config.minBuyUsdt.toLocaleString() : '1,000'} USDT) and enter your USDT TRC20 address.<br />
          2. Send the exact TRX amount shown to the payment address.<br />
          3. After 19 on-chain confirmations, your USDT is sent to your address.<br />
          4. USDT is sent <b>only</b> after the TRX payment is confirmed on-chain.<br />
          Support: @{config?.supportUsername || 'YourSupport'}
        </div>
      </div>

      <div className="card">
        <h2>Invite friends</h2>
        {referralLink ? (
          <>
            <div className="addr-box">
              <span className="mono">{referralLink}</span>
              <button
                className="btn-small"
                onClick={async () => {
                  await copyText(referralLink);
                  setCopied('ref');
                  setTimeout(() => setCopied(''), 2000);
                }}
              >
                {copied === 'ref' ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              Share your link — friends who open it join through your referral
              (t.me bot/app ?startapp=ref_{user?.id}).
              {refCount !== null && <> You have referred <b>{refCount}</b> user{refCount === 1 ? '' : 's'} so far.</>}
            </div>
          </>
        ) : (
          <div className="hint">Referral links are not configured yet (admin: set TELEGRAM_BOT_USERNAME + TELEGRAM_APP_SHORT_NAME).</div>
        )}
      </div>

      <div className="card">
        <h2>Support</h2>
        {supportThread.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {supportThread.map((m, i) => (
              <div key={i} className="hint" style={{ fontSize: 13, marginBottom: 6 }}>
                <b>{m.direction === 'admin' ? 'Support' : 'You'}:</b> {m.message}
              </div>
            ))}
          </div>
        )}
        <div className="field">
          <div className="input-row">
            <input
              value={supportText}
              onChange={(e) => setSupportText(e.target.value)}
              placeholder="Message support…"
            />
            <button className="paste-btn" onClick={sendSupport}>Send</button>
          </div>
          {supportSent && <div className="hint" style={{ marginTop: 6 }}>{supportSent}</div>}
          <div className="hint">You can also message the bot directly in Telegram — it reaches the same support inbox.</div>
        </div>
      </div>
    </div>
    <FooterMenu />
    </TelegramGate>
  );
}
