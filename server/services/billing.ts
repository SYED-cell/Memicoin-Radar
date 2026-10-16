import { uid } from '../../shared/random.ts';
import { all, one, run } from '../db.ts';
import { config } from '../env.ts';
import { HttpError } from '../lib/http.ts';
import { log } from '../lib/log.ts';
import { requestJson } from '../pipeline/httpClient.ts';
import { registerSource } from '../pipeline/httpClient.ts';
import { sendToUser } from './sse.ts';

/**
 * Pro subscriptions paid in USDT on Tron (TRC20) or Ethereum (ERC20).
 *
 * Payments go straight to wallets you control — this server never holds a key and cannot move
 * funds. A pending payment is given a unique amount (29.00, 29.01, 29.02 …), and a transfer of
 * exactly that amount to the address is what identifies which account paid. The chain is the
 * source of truth: nothing grants Pro except a confirmed transfer.
 */

export type Network = 'trc20' | 'erc20';

const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_ERC20_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const INTENT_TTL_MS = 60 * 60_000;
const DECIMALS = 1e6; // USDT uses 6 decimals on both chains

registerSource('chainpay', 60);

export interface PaymentIntent {
  id: string;
  network: Network;
  address: string;
  amount: string;
  days: number;
  expiresAt: number;
  status: 'pending' | 'paid' | 'expired';
  txHash?: string | null;
}

interface PaymentRow {
  id: string;
  user_id: string;
  network: Network;
  address: string;
  amount: string;
  days: number;
  status: 'pending' | 'paid' | 'expired';
  tx_hash: string | null;
  created_at: number;
  expires_at: number;
  paid_at: number | null;
}

export const addressFor = (network: Network): string => (network === 'trc20' ? config.billing.trc20Address : config.billing.erc20Address);

export const billingEnabled = (): boolean => Boolean(config.billing.trc20Address || config.billing.erc20Address);

export function proUntil(userId: string): number | null {
  const row = one<{ pro_until: number | null }>('SELECT pro_until FROM users WHERE id = ?', userId);
  return row?.pro_until ?? null;
}

export function isPro(userId: string): boolean {
  if ((proUntil(userId) ?? 0) > Date.now()) return true;
  // Comped accounts: the operator should not have to pay their own wallet to see their own product.
  if (!config.billing.proEmails.length) return false;
  const email = one<{ email: string }>('SELECT email FROM users WHERE id = ?', userId)?.email;
  return Boolean(email && config.billing.proEmails.includes(email.toLowerCase()));
}

const toIntent = (r: PaymentRow): PaymentIntent => ({
  id: r.id,
  network: r.network,
  address: r.address,
  amount: r.amount,
  days: r.days,
  expiresAt: r.expires_at,
  status: r.status,
  txHash: r.tx_hash,
});

/** The open payment for this account, if any. */
export function pendingIntent(userId: string): PaymentIntent | null {
  const row = one<PaymentRow>("SELECT * FROM payments WHERE user_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC", userId, Date.now());
  return row ? toIntent(row) : null;
}

/**
 * Opens a payment. The amount is nudged by cents until it is unique among open payments, which is
 * what lets an incoming transfer be matched back to this account without asking anyone to paste a
 * transaction hash.
 */
export function createIntent(userId: string, network: Network): PaymentIntent {
  const address = addressFor(network);
  if (!address) throw new HttpError(503, `${network.toUpperCase()} payments are not configured on this server`, 'billing_unconfigured');

  const existing = pendingIntent(userId);
  if (existing && existing.network === network) return existing;

  const base = config.billing.priceUsdt;
  const taken = new Set(
    all<{ amount: string }>("SELECT amount FROM payments WHERE network = ? AND status = 'pending' AND expires_at > ?", network, Date.now()).map((r) => r.amount),
  );
  let amount = '';
  for (let cents = 0; cents < 100; cents++) {
    const candidate = (base + cents / 100).toFixed(2);
    if (!taken.has(candidate)) {
      amount = candidate;
      break;
    }
  }
  if (!amount) throw new HttpError(503, 'Too many payments in flight, try again in an hour', 'billing_busy');

  const now = Date.now();
  const id = uid('pay_');
  run(
    'INSERT INTO payments (id, user_id, network, address, amount, days, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    userId,
    network,
    address,
    amount,
    config.billing.days,
    'pending',
    now,
    now + INTENT_TTL_MS,
  );
  log.info('billing', `payment opened for ${userId}: ${amount} USDT on ${network}`);
  return toIntent(one<PaymentRow>('SELECT * FROM payments WHERE id = ?', id)!);
}

export interface Transfer {
  amount: string;
  to: string;
  hash: string;
  at: number;
}

/**
 * Which incoming transfer settles a pending payment: exact amount to our address, not older than
 * the payment itself. The amount is unique among open payments, so an exact match identifies the
 * payer; a small backdate allows for a wallet that broadcast just before the intent was recorded.
 */
export function matchTransfer(payment: { amount: string; created_at: number }, transfers: Transfer[], address: string): Transfer | undefined {
  return transfers.find((t) => t.amount === payment.amount && t.to.toLowerCase() === address.toLowerCase() && t.at >= payment.created_at - 5 * 60_000);
}

async function tronTransfers(address: string): Promise<Transfer[]> {
  const url = `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=50&only_to=true&contract_address=${USDT_TRC20_CONTRACT}`;
  const res = await requestJson<{ data?: { value?: string; to?: string; transaction_id?: string; block_timestamp?: number }[] }>(url, {
    source: 'chainpay',
    ttl: 20_000,
    timeoutMs: 10_000,
    retries: 1,
    init: config.billing.trongridKey ? { headers: { 'TRON-PRO-API-KEY': config.billing.trongridKey } } : undefined,
  });
  return (res.data ?? [])
    .filter((t) => t.value && t.to)
    .map((t) => ({ amount: (Number(t.value) / DECIMALS).toFixed(2), to: t.to!, hash: t.transaction_id ?? '', at: t.block_timestamp ?? 0 }));
}

async function ethTransfers(address: string): Promise<Transfer[]> {
  if (!config.billing.etherscanKey) return []; // Etherscan requires a key; without one ERC20 cannot be confirmed
  const url =
    `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&contractaddress=${USDT_ERC20_CONTRACT}` +
    `&address=${address}&page=1&offset=50&sort=desc&apikey=${config.billing.etherscanKey}`;
  const res = await requestJson<{ result?: { value?: string; to?: string; hash?: string; timeStamp?: string }[] }>(url, {
    source: 'chainpay',
    ttl: 20_000,
    timeoutMs: 10_000,
    retries: 1,
  });
  return (Array.isArray(res.result) ? res.result : [])
    .filter((t) => t.value && t.to)
    .map((t) => ({ amount: (Number(t.value) / DECIMALS).toFixed(2), to: t.to!, hash: t.hash ?? '', at: Number(t.timeStamp ?? 0) * 1000 }));
}

function grantPro(row: PaymentRow, hash: string) {
  const now = Date.now();
  const current = proUntil(row.user_id) ?? 0;
  // Stacking: paying again while Pro is active extends it rather than restarting it.
  const until = Math.max(current, now) + row.days * 86_400_000;
  run('UPDATE users SET pro_until = ?, updated_at = ? WHERE id = ?', until, now, row.user_id);
  run("UPDATE payments SET status = 'paid', tx_hash = ?, paid_at = ? WHERE id = ?", hash, now, row.id);
  log.info('billing', `payment confirmed: ${row.amount} USDT on ${row.network} → Pro until ${new Date(until).toISOString()}`);
  sendToUser(row.user_id, 'pro', { proUntil: until, paymentId: row.id });
}

/** Matches confirmed transfers against open payments; the chain decides, nothing else. */
async function checkNetwork(network: Network) {
  const address = addressFor(network);
  if (!address) return;
  const pending = all<PaymentRow>("SELECT * FROM payments WHERE status = 'pending' AND network = ? AND expires_at > ?", network, Date.now());
  if (!pending.length) return;
  const transfers = network === 'trc20' ? await tronTransfers(address) : await ethTransfers(address);
  if (!transfers.length) return;
  for (const row of pending) {
    const hit = matchTransfer(row, transfers, address);
    if (hit) grantPro(row, hit.hash);
  }
}

let timers: ReturnType<typeof setInterval>[] = [];

export function startBilling() {
  if (!billingEnabled()) {
    log.info('billing', 'USDT addresses not set — Pro upgrades are disabled (USDT_TRC20_ADDRESS / USDT_ERC20_ADDRESS)');
    return;
  }
  const sweep = async () => {
    run("UPDATE payments SET status = 'expired' WHERE status = 'pending' AND expires_at < ?", Date.now());
    for (const network of ['trc20', 'erc20'] as Network[]) {
      try {
        await checkNetwork(network);
      } catch (err) {
        log.warn('billing', `${network} check failed`, err);
      }
    }
  };
  void sweep();
  timers = [setInterval(() => void sweep(), 45_000)];
  log.info('billing', `Pro at ${config.billing.priceUsdt} USDT / ${config.billing.days} days · ${config.billing.trc20Address ? 'TRC20 ' : ''}${config.billing.erc20Address ? 'ERC20' : ''}`);
}

export function stopBilling() {
  timers.forEach(clearInterval);
  timers = [];
}
