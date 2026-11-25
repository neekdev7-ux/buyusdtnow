import { db } from './supabase';
import { base58ToHex, CONFIRMATIONS_REQUIRED, USDT_TRC20_CONTRACT } from './tron';
import { notifyAdmin } from './notify';
import type { ExchangeSettings } from './settings';

export type OrderStatus =
  | 'AWAITING_PAYMENT'
  | 'TRX_RECEIVED'
  | 'TRX_CONFIRMED'
  | 'USDT_SENDING'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'FAILED';

export interface OrderRow {
  id: string;
  telegram_id: string;
  telegram_username: string | null;
  usdt_amount: number;
  trx_rate: number;
  trx_amount: number;
  trx_amount_sun: number | string;
  receive_address: string;
  payment_address: string;
  status: OrderStatus;
  trx_txid: string | null;
  trx_from: string | null;
  confirmations: number;
  usdt_txid: string | null;
  notes: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

const TRONGRID = 'https://api.trongrid.io';

function trongridHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
  return headers;
}

interface TronGridTrxTx {
  txID: string;
  blockNumber?: number;
  block_timestamp: number;
  raw_data?: {
    contract?: Array<{
      parameter?: { value?: { amount?: number; owner_address?: string; to_address?: string } };
    }>;
  };
}

/**
 * Check one order's TRX payment on TronGrid.
 * - Finds a TRX transfer TO the payment address, value == trx_amount_sun exactly,
 *   block_timestamp >= order created time.
 * - Confirms via the transaction detail + current block height; requires
 *   >= CONFIRMATIONS_REQUIRED (19) confirmations.
 * - A transfer with the WRONG amount is recorded in `notes` and the order is
 *   marked FAILED (underpaid/overpaid) — never credited.
 * - On confirmation: auto-sends USDT if enabled (see sendUsdt), otherwise the
 *   order becomes TRX_CONFIRMED and waits in the admin payout queue.
 */
export async function checkOrderPayment(
  order: OrderRow,
  settings: ExchangeSettings,
): Promise<{ status: OrderStatus; txid?: string; confirmations?: number; note?: string }> {
  const now = new Date();
  if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'TRX_RECEIVED') {
    return { status: order.status };
  }
  if (new Date(order.expires_at).getTime() <= now.getTime() && !order.trx_txid) {
    await updateOrder(order.id, { status: 'EXPIRED' });
    return { status: 'EXPIRED' };
  }

  const createdMs = new Date(order.created_at).getTime();
  const paymentHex = base58ToHex(order.payment_address);
  const expectedSun = BigInt(order.trx_amount_sun);

  const url =
    `${TRONGRID}/v1/accounts/${order.payment_address}/transactions/trx` +
    `?only_confirmed=true&min_timestamp=${createdMs}&limit=200&order_by=block_timestamp,asc`;
  const res = await fetch(url, { headers: trongridHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`TronGrid error ${res.status}`);
  const json = (await res.json()) as { data?: TronGridTrxTx[] };
  const txs = json.data || [];

  let matched: TronGridTrxTx | null = null;
  let mismatched: TronGridTrxTx | null = null;
  for (const tx of txs) {
    const value = tx.raw_data?.contract?.[0]?.parameter?.value;
    if (!value) continue;
    const toHex = (value.to_address || '').toLowerCase();
    if (toHex !== paymentHex.toLowerCase()) continue;
    if (value.amount === undefined) continue;
    if (BigInt(value.amount) === expectedSun) {
      matched = tx;
      break;
    }
    mismatched = tx;
  }

  if (!matched) {
    if (mismatched) {
      const value = mismatched.raw_data?.contract?.[0]?.parameter?.value;
      const note =
        `Amount mismatch: received ${value?.amount} SUN, expected ${expectedSun.toString()} SUN ` +
        `(tx ${mismatched.txID}). Do NOT credit — contact support.`;
      await updateOrder(order.id, { status: 'FAILED', notes: note, trx_txid: mismatched.txID });
      return { status: 'FAILED', txid: mismatched.txID, note };
    }
    return { status: order.status };
  }

  // Confirmations: current block height minus the tx block.
  const detailRes = await fetch(`${TRONGRID}/v1/transactions/${matched.txID}`, {
    headers: trongridHeaders(),
    cache: 'no-store',
  });
  const detail = (await detailRes.json()) as { data?: Array<{ blockNumber?: number; confirmed?: boolean }> };
  const blockNumber = detail.data?.[0]?.blockNumber;
  const nowBlockRes = await fetch(`${TRONGRID}/wallet/getnowblock`, {
    headers: trongridHeaders(),
    cache: 'no-store',
  });
  const nowBlock = (await nowBlockRes.json()) as { block_header?: { raw_data?: { number?: number } } };
  const currentBlock = nowBlock.block_header?.raw_data?.number;
  const confirmations =
    blockNumber !== undefined && currentBlock !== undefined ? Math.max(0, currentBlock - blockNumber) : 0;
  const fromHex = matched.raw_data?.contract?.[0]?.parameter?.value?.owner_address || null;

  if (confirmations < CONFIRMATIONS_REQUIRED) {
    await updateOrder(order.id, {
      status: 'TRX_RECEIVED',
      trx_txid: matched.txID,
      trx_from: fromHex,
      confirmations,
    });
    return { status: 'TRX_RECEIVED', txid: matched.txID, confirmations };
  }

  await updateOrder(order.id, {
    status: 'TRX_CONFIRMED',
    trx_txid: matched.txID,
    trx_from: fromHex,
    confirmations,
  });
  // Admin notification: payment confirmed, payout pending.
  void notifyAdmin(
    `💰 TRX payment confirmed\nOrder ${order.id}\n${Number(order.usdt_amount).toLocaleString()} USDT → ${order.receive_address}\n${Number(order.trx_amount).toLocaleString()} TRX received (tx ${matched.txID})\nPayout pending — check /admin.`,
  );

  // Auto-send USDT if enabled and within the cap; otherwise queue for admin.
  const autoSend =
    settings.autoSendUsdt &&
    Boolean(process.env.USDT_HOT_WALLET_PRIVATE_KEY) &&
    Number(order.usdt_amount) <= settings.maxAutoSendUsdt;
  if (autoSend) {
    await updateOrder(order.id, { status: 'USDT_SENDING' });
    try {
      const usdtTxid = await sendUsdt(order.receive_address, Number(order.usdt_amount));
      await updateOrder(order.id, { status: 'COMPLETED', usdt_txid: usdtTxid });
      void notifyAdmin(
        `✅ Order completed (auto-send)\nOrder ${order.id}\n${Number(order.usdt_amount).toLocaleString()} USDT sent to ${order.receive_address}\nUSDT TX: ${usdtTxid}`,
      );
      return { status: 'COMPLETED', txid: matched.txID, confirmations };
    } catch (err) {
      const note = `Auto-send failed: ${err instanceof Error ? err.message : String(err)}. Admin must send manually.`;
      await updateOrder(order.id, { status: 'TRX_CONFIRMED', notes: note });
      return { status: 'TRX_CONFIRMED', txid: matched.txID, confirmations, note };
    }
  }
  return { status: 'TRX_CONFIRMED', txid: matched.txID, confirmations };
}

/**
 * Send USDT (TRC20) from the hot wallet via tronweb triggerSmartContract.
 * Refuses to run without a private key. NEVER logs the key.
 * Amount is usdt * 1e6 (USDT has 6 decimals).
 */
export async function sendUsdt(receiveAddress: string, usdtAmount: number): Promise<string> {
  const privateKey = process.env.USDT_HOT_WALLET_PRIVATE_KEY;
  const hotWallet = process.env.USDT_HOT_WALLET_ADDRESS;
  if (!privateKey) throw new Error('USDT_HOT_WALLET_PRIVATE_KEY is not set — auto-send disabled');
  if (!hotWallet) throw new Error('USDT_HOT_WALLET_ADDRESS is not set');
  const maxAuto = Number(process.env.MAX_AUTO_SEND_USDT || 5000);
  if (usdtAmount > maxAuto) throw new Error(`Amount ${usdtAmount} exceeds MAX_AUTO_SEND_USDT (${maxAuto})`);

  // Dynamic import so the rest of the app builds/runs even without tronweb loaded.
  const { TronWeb } = (await import('tronweb')) as unknown as { TronWeb: new (opts: Record<string, unknown>) => any };
  const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io', privateKey });
  const amountSun = Math.round(usdtAmount * 1e6);
  const result = await tronWeb.transactionBuilder.triggerSmartContract(
    USDT_TRC20_CONTRACT,
    'transfer(address,uint256)',
    { feeLimit: 100_000_000, callValue: 0 },
    [
      { type: 'address', value: receiveAddress },
      { type: 'uint256', value: amountSun },
    ],
    hotWallet,
  );
  if (!result || !result.result || !result.transaction) {
    throw new Error('triggerSmartContract failed — no transaction returned');
  }
  const signed = await tronWeb.trx.sign(result.transaction);
  const broadcast = await tronWeb.trx.sendRawTransaction(signed);
  if (!broadcast || !broadcast.txid) throw new Error('Broadcast failed — no txid returned');
  return broadcast.txid as string;
}

export async function updateOrder(id: string, patch: Partial<OrderRow>): Promise<void> {
  await db()
    .from('orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
}

/** Expire stale AWAITING_PAYMENT orders past their expiry. Returns count expired. */
export async function expireStaleOrders(): Promise<number> {
  const { data } = await db()
    .from('orders')
    .select('id')
    .eq('status', 'AWAITING_PAYMENT')
    .lt('expires_at', new Date().toISOString());
  const rows = (data || []) as Array<{ id: string }>;
  for (const row of rows) {
    await updateOrder(row.id, { status: 'EXPIRED' });
  }
  return rows.length;
}
