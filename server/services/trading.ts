import { uid } from '../../shared/random.ts';
import type { Alert, Position, Token, TradeReason, TradeSide, TradingState, Transaction } from '../../shared/types.ts';
import { all, one, run, tx } from '../db.ts';
import { HttpError } from '../lib/http.ts';
import { log } from '../lib/log.ts';
import { monitor } from '../pipeline/monitor.ts';
import { deliver, invalidateHeld } from './alerts.ts';
import { sendToUser } from './sse.ts';
import { getSettings, refreshPinned } from './userData.ts';

/**
 * Paper trading only — no wallets, no keys, no real orders. Prices come from the live monitor.
 * Stop-loss / take-profit are enforced server-side so they trigger while the user is offline.
 */
export const STARTING_BALANCE = 10_000;
export const FEE_RATE = 0.003;
export const SLIPPAGE = 0.005;
const MAX_PRICE_AGE_MS = 5 * 60_000;

interface PositionRow {
  mint: string;
  symbol: string;
  quantity: number;
  avg_entry: number;
  opened_at: number;
  stop_loss: number | null;
  take_profit: number | null;
  user_id: string;
}

function ensurePortfolio(userId: string) {
  run('INSERT OR IGNORE INTO portfolios (user_id, starting_balance, cash, updated_at) VALUES (?, ?, ?, ?)', userId, STARTING_BALANCE, STARTING_BALANCE, Date.now());
  return one<{ starting_balance: number; cash: number }>('SELECT starting_balance, cash FROM portfolios WHERE user_id = ?', userId)!;
}

const toPosition = (r: PositionRow): Position => ({
  tokenId: r.mint,
  symbol: r.symbol,
  quantity: r.quantity,
  avgEntry: r.avg_entry,
  openedAt: r.opened_at,
  stopLoss: r.stop_loss ?? undefined,
  takeProfit: r.take_profit ?? undefined,
});

export function getPortfolio(userId: string): TradingState {
  const p = ensurePortfolio(userId);
  const positions = all<PositionRow>('SELECT * FROM positions WHERE user_id = ? ORDER BY opened_at', userId).map(toPosition);
  const transactions = all<{ id: string; mint: string; symbol: string; side: TradeSide; quantity: number; price: number; total: number; fee: number; realized_pnl: number | null; reason: TradeReason; created_at: number }>(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 300',
    userId,
  ).map<Transaction>((r) => ({
    id: r.id,
    tokenId: r.mint,
    symbol: r.symbol,
    side: r.side,
    quantity: r.quantity,
    price: r.price,
    total: r.total,
    fee: r.fee,
    realizedPnl: r.realized_pnl ?? undefined,
    reason: r.reason,
    createdAt: r.created_at,
  }));
  const equity = all<{ t: number; value: number }>('SELECT t, value FROM equity WHERE user_id = ? ORDER BY t DESC LIMIT 500', userId).reverse();
  return { startingBalance: p.starting_balance, cash: p.cash, positions, transactions, equity };
}

async function priceFor(mint: string): Promise<Token> {
  const t = monitor.get(mint) ?? (await monitor.lookup(mint));
  if (!t || !(t.price > 0)) throw new HttpError(409, 'No live price available for this token yet', 'no_price');
  if (!t.marketUpdatedAt || Date.now() - t.marketUpdatedAt > MAX_PRICE_AGE_MS) throw new HttpError(409, 'Price data is stale — try again in a few seconds', 'stale_price');
  return t;
}

function equityValue(userId: string, cash: number): number {
  return cash + all<PositionRow>('SELECT * FROM positions WHERE user_id = ?', userId).reduce((s, p) => s + p.quantity * (monitor.get(p.mint)?.price ?? p.avg_entry), 0);
}

export interface ExecuteInput {
  mint: string;
  side: TradeSide;
  quantity?: number;
  usd?: number;
  stopLoss?: number;
  takeProfit?: number;
  reason?: TradeReason;
}

export async function execute(userId: string, input: ExecuteInput): Promise<Transaction> {
  const token = await priceFor(input.mint);
  const execPrice = token.price * (input.side === 'buy' ? 1 + SLIPPAGE : 1 - SLIPPAGE);
  const settings = getSettings(userId).trading;

  const txn = tx(() => {
    const p = ensurePortfolio(userId);
    const pos = one<PositionRow>('SELECT * FROM positions WHERE user_id = ? AND mint = ?', userId, input.mint);
    let qty = input.quantity ?? (input.usd !== undefined ? input.usd / (execPrice * (input.side === 'buy' ? 1 + FEE_RATE : 1)) : 0);
    if (input.side === 'sell' && pos && qty > pos.quantity * 0.999999) qty = pos.quantity;
    if (!(qty > 0) || !Number.isFinite(qty)) throw new HttpError(422, 'Quantity must be greater than zero', 'validation_error', { quantity: 'Quantity must be greater than zero' });
    const total = qty * execPrice;
    const fee = total * FEE_RATE;

    if (input.side === 'buy') {
      if (total + fee > p.cash + 1e-9) throw new HttpError(422, 'Insufficient paper balance', 'insufficient_funds', { quantity: 'Insufficient paper balance' });
      const equity = equityValue(userId, p.cash);
      const positionValue = (pos?.quantity ?? 0) * execPrice + total;
      if (positionValue > (equity * settings.maxPositionPct) / 100 + 1e-6) {
        throw new HttpError(422, `Position would exceed your max position size (${settings.maxPositionPct}% of equity)`, 'max_position', { quantity: 'Exceeds max position size' });
      }
      if (input.stopLoss !== undefined && input.stopLoss >= execPrice) throw new HttpError(422, 'Stop-loss must be below the entry price', 'validation_error', { stopLoss: 'Must be below entry' });
      if (input.takeProfit !== undefined && input.takeProfit <= execPrice) throw new HttpError(422, 'Take-profit must be above the entry price', 'validation_error', { takeProfit: 'Must be above entry' });
      if (pos) {
        const newQty = pos.quantity + qty;
        run(
          'UPDATE positions SET quantity = ?, avg_entry = ?, stop_loss = COALESCE(?, stop_loss), take_profit = COALESCE(?, take_profit) WHERE user_id = ? AND mint = ?',
          newQty,
          (pos.avg_entry * pos.quantity + execPrice * qty) / newQty,
          input.stopLoss ?? null,
          input.takeProfit ?? null,
          userId,
          input.mint,
        );
      } else {
        run(
          'INSERT INTO positions (user_id, mint, symbol, quantity, avg_entry, opened_at, stop_loss, take_profit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          userId,
          input.mint,
          token.symbol,
          qty,
          execPrice,
          Date.now(),
          input.stopLoss ?? null,
          input.takeProfit ?? null,
        );
      }
      run('UPDATE portfolios SET cash = cash - ?, updated_at = ? WHERE user_id = ?', total + fee, Date.now(), userId);
    } else {
      if (!pos) throw new HttpError(422, `You don't hold $${token.symbol}`, 'no_position');
      if (qty > pos.quantity + 1e-9) throw new HttpError(422, 'You cannot sell more than you hold', 'validation_error', { quantity: 'Exceeds holdings' });
      const remaining = pos.quantity - qty;
      if (remaining <= pos.quantity * 1e-9) run('DELETE FROM positions WHERE user_id = ? AND mint = ?', userId, input.mint);
      else run('UPDATE positions SET quantity = ? WHERE user_id = ? AND mint = ?', remaining, userId, input.mint);
      run('UPDATE portfolios SET cash = cash + ?, updated_at = ? WHERE user_id = ?', total - fee, Date.now(), userId);
    }

    const t: Transaction = {
      id: uid('tx_'),
      tokenId: input.mint,
      symbol: token.symbol,
      side: input.side,
      quantity: qty,
      price: execPrice,
      total,
      fee,
      realizedPnl: input.side === 'sell' && pos ? (execPrice - pos.avg_entry) * qty - fee : undefined,
      reason: input.reason ?? 'manual',
      createdAt: Date.now(),
    };
    run(
      'INSERT INTO transactions (id, user_id, mint, symbol, side, quantity, price, total, fee, realized_pnl, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      t.id,
      userId,
      t.tokenId,
      t.symbol,
      t.side,
      t.quantity,
      t.price,
      t.total,
      t.fee,
      t.realizedPnl ?? null,
      t.reason ?? 'manual',
      t.createdAt,
    );
    return t;
  });
  invalidateHeld(userId);
  refreshPinned();
  snapshotEquity(userId);
  sendToUser(userId, 'portfolio', { changed: true });
  return txn;
}

export function setOrders(userId: string, mint: string, orders: { stopLoss?: number | null; takeProfit?: number | null }) {
  const pos = one<PositionRow>('SELECT * FROM positions WHERE user_id = ? AND mint = ?', userId, mint);
  if (!pos) throw new HttpError(404, 'Position not found', 'not_found');
  const price = monitor.get(mint)?.price ?? pos.avg_entry;
  if (orders.stopLoss != null && orders.stopLoss >= price) throw new HttpError(422, 'Stop-loss must be below the current price', 'validation_error', { stopLoss: 'Must be below current price' });
  if (orders.takeProfit != null && orders.takeProfit <= price) throw new HttpError(422, 'Take-profit must be above the current price', 'validation_error', { takeProfit: 'Must be above current price' });
  run('UPDATE positions SET stop_loss = ?, take_profit = ? WHERE user_id = ? AND mint = ?', orders.stopLoss ?? null, orders.takeProfit ?? null, userId, mint);
  sendToUser(userId, 'portfolio', { changed: true });
}

export function resetPortfolio(userId: string) {
  tx(() => {
    run('DELETE FROM positions WHERE user_id = ?', userId);
    run('DELETE FROM transactions WHERE user_id = ?', userId);
    run('DELETE FROM equity WHERE user_id = ?', userId);
    run('INSERT INTO portfolios (user_id, starting_balance, cash, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET cash = excluded.cash, starting_balance = excluded.starting_balance, updated_at = excluded.updated_at', userId, STARTING_BALANCE, STARTING_BALANCE, Date.now());
  });
  invalidateHeld(userId);
  refreshPinned();
}

function snapshotEquity(userId: string) {
  const p = one<{ cash: number }>('SELECT cash FROM portfolios WHERE user_id = ?', userId);
  if (!p) return;
  run('INSERT INTO equity (user_id, t, value) VALUES (?, ?, ?)', userId, Date.now(), equityValue(userId, p.cash));
}

/** Stop-loss / take-profit enforcement on every price update. */
function onTransition(_prev: Token, next: Token) {
  const rows = all<PositionRow>('SELECT * FROM positions WHERE mint = ? AND (stop_loss IS NOT NULL OR take_profit IS NOT NULL)', next.id);
  for (const r of rows) {
    const reason: TradeReason | null = r.stop_loss !== null && next.price <= r.stop_loss ? 'stop-loss' : r.take_profit !== null && next.price >= r.take_profit ? 'take-profit' : null;
    if (!reason) continue;
    // Clear orders first so concurrent updates cannot double-trigger.
    run('UPDATE positions SET stop_loss = NULL, take_profit = NULL WHERE user_id = ? AND mint = ?', r.user_id, r.mint);
    execute(r.user_id, { mint: r.mint, side: 'sell', quantity: r.quantity, reason })
      .then((t) => {
        const alert: Alert = {
          id: uid('al_'),
          severity: reason === 'stop-loss' ? 'warning' : 'info',
          category: 'trade',
          tokenId: r.mint,
          symbol: r.symbol,
          title: reason === 'stop-loss' ? 'Stop-loss triggered (paper)' : 'Take-profit hit (paper)',
          message: `Sold ${t.quantity.toFixed(0)} at $${t.price.toPrecision(4)} · P/L $${(t.realizedPnl ?? 0).toFixed(2)}`,
          createdAt: Date.now(),
          read: false,
        };
        deliver(r.user_id, [alert], next);
      })
      .catch((err: unknown) => log.warn('trading', `${reason} execution failed for ${r.user_id}/${r.mint}`, err));
  }
}

let equityTimer: ReturnType<typeof setInterval> | undefined;

export function startTrading() {
  monitor.on('transition', onTransition);
  equityTimer = setInterval(() => {
    for (const { user_id } of all<{ user_id: string }>('SELECT DISTINCT user_id FROM positions')) snapshotEquity(user_id);
    run('DELETE FROM equity WHERE t < ?', Date.now() - 30 * 86_400_000);
  }, 5 * 60_000);
}

export function stopTrading() {
  clearInterval(equityTimer);
}
