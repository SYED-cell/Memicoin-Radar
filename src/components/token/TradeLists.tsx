import { History, Pencil, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMarket } from '../../context/MarketContext';
import { useToast } from '../../context/ToastContext';
import { useTrading } from '../../context/TradingContext';
import type { EnrichedPosition } from '../../services/portfolio';
import type { Transaction } from '../../types';
import { cn } from '../../utils/cn';
import { formatDateTime, formatPercent, formatPrice, formatQty, formatSignedUsd, formatUsd } from '../../utils/format';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { TokenAvatar } from '../ui/primitives';

function OrdersModal({ position, onClose }: { position: EnrichedPosition | null; onClose: () => void }) {
  const { setOrders } = useTrading();
  const toast = useToast();
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (position && openedFor !== position.tokenId) {
    setOpenedFor(position.tokenId);
    setSl(position.stopLoss ? String(Number(position.stopLoss.toPrecision(6))) : '');
    setTp(position.takeProfit ? String(Number(position.takeProfit.toPrecision(6))) : '');
    setError(null);
  }
  if (!position && openedFor) setOpenedFor(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!position) return;
    const s = sl.trim() ? Number(sl) : null;
    const t = tp.trim() ? Number(tp) : null;
    if (s !== null && s >= position.currentPrice) return setError('Stop-loss must be below the current price.');
    if (t !== null && t <= position.currentPrice) return setError('Take-profit must be above the current price.');
    setBusy(true);
    try {
      await setOrders(position.tokenId, { stopLoss: s, takeProfit: t });
      toast.success('Orders updated', 'Enforced server-side on every price update.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update orders');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!position}
      onClose={onClose}
      title={position ? `Orders for $${position.symbol}` : 'Orders'}
      description={position ? `Current price ${formatPrice(position.currentPrice)} · entry ${formatPrice(position.avgEntry)}` : undefined}
      size="sm"
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" form="orders-form" disabled={busy}>
            Save
          </button>
        </>
      }
    >
      <form id="orders-form" onSubmit={submit} noValidate className="space-y-3">
        <div>
          <label className="label" htmlFor="sl-input">
            Stop-loss price (blank = none)
          </label>
          <input id="sl-input" inputMode="decimal" className="input num" value={sl} onChange={(e) => setSl(e.target.value.replace(/[^0-9.]/g, ''))} data-autofocus />
        </div>
        <div>
          <label className="label" htmlFor="tp-input">
            Take-profit price (blank = none)
          </label>
          <input id="tp-input" inputMode="decimal" className="input num" value={tp} onChange={(e) => setTp(e.target.value.replace(/[^0-9.]/g, ''))} />
        </div>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function PositionList({ positions, onTrade }: { positions: EnrichedPosition[]; onTrade?: (tokenId: string, side: 'buy' | 'sell') => void }) {
  const [editing, setEditing] = useState<EnrichedPosition | null>(null);
  if (positions.length === 0) return <EmptyState icon={Wallet} title="No open positions" description="Place a paper trade to start building your portfolio." />;
  return (
    <>
      <ul className="divide-y divide-line">
        {positions.map((p) => {
          const up = p.unrealizedPnl >= 0;
          return (
            <li key={p.tokenId} className="flex flex-wrap items-center gap-3 py-3">
              <Link to={`/tokens/${p.tokenId}`} className="flex min-w-0 flex-1 items-center gap-3">
                {p.token ? <TokenAvatar token={p.token} /> : <span className="grid size-9 place-items-center rounded-full bg-surface-3">🪙</span>}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    ${p.symbol} <span className="num text-[11px] font-normal text-muted">· {formatPercent(p.exposurePct, 1, false)} of equity</span>
                  </p>
                  <p className="num truncate text-[11px] text-muted">
                    {formatQty(p.quantity)} · Entry {formatPrice(p.avgEntry)} · Now {formatPrice(p.currentPrice)}
                  </p>
                  <p className="num truncate text-[11px] text-subtle">
                    SL {p.stopLoss ? formatPrice(p.stopLoss) : '—'} · TP {p.takeProfit ? formatPrice(p.takeProfit) : '—'}
                    {p.riskAtStop !== null && ` · risk to stop ${formatUsd(Math.max(0, p.riskAtStop))}`}
                  </p>
                </div>
              </Link>
              <div className="text-right">
                <p className="num text-sm font-semibold">{formatUsd(p.value)}</p>
                <p className={cn('num text-xs font-semibold', up ? 'text-primary' : 'text-danger')}>
                  {formatSignedUsd(p.unrealizedPnl)} ({formatPercent(p.unrealizedPct)})
                </p>
              </div>
              {onTrade && (
                <div className="flex w-full gap-2 sm:w-auto">
                  <button className="btn btn-outline btn-sm flex-1" onClick={() => setEditing(p)} aria-label={`Edit stop-loss and take-profit for ${p.symbol}`}>
                    <Pencil className="size-3" /> SL/TP
                  </button>
                  <button className="btn btn-outline btn-sm flex-1" onClick={() => onTrade(p.tokenId, 'buy')}>
                    Buy
                  </button>
                  <button className="btn btn-outline btn-sm flex-1 text-danger" onClick={() => onTrade(p.tokenId, 'sell')}>
                    Sell
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <OrdersModal position={editing} onClose={() => setEditing(null)} />
    </>
  );
}

const REASON_LABEL = { manual: 'Manual', 'stop-loss': 'Stop-loss', 'take-profit': 'Take-profit' } as const;

export function TransactionList({ transactions, limit }: { transactions: Transaction[]; limit?: number }) {
  const { getToken } = useMarket();
  if (transactions.length === 0) return <EmptyState icon={History} title="No transactions yet" description="Your paper trades will be listed here." />;
  const list = limit ? transactions.slice(0, limit) : transactions;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="px-2 py-2 font-medium">Token</th>
            <th scope="col" className="px-2 py-2 font-medium">Side</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Qty</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Price</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Total</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">P/L</th>
            <th scope="col" className="px-2 py-2 font-medium">Trigger</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Time</th>
          </tr>
        </thead>
        <tbody>
          {list.map((tx) => {
            const token = getToken(tx.tokenId);
            return (
              <tr key={tx.id} className="border-b border-line/60 last:border-0">
                <td className="px-2 py-2.5">
                  <Link to={`/tokens/${tx.tokenId}`} className="flex items-center gap-2 font-semibold hover:text-primary">
                    {token && <TokenAvatar token={token} size="sm" />}${tx.symbol}
                  </Link>
                </td>
                <td className="px-2 py-2.5">
                  <span className={cn('chip uppercase', tx.side === 'buy' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-danger/40 bg-danger/10 text-danger')}>{tx.side}</span>
                </td>
                <td className="num px-2 py-2.5 text-right">{formatQty(tx.quantity)}</td>
                <td className="num px-2 py-2.5 text-right">{formatPrice(tx.price)}</td>
                <td className="num px-2 py-2.5 text-right">{formatUsd(tx.total)}</td>
                <td className={cn('num px-2 py-2.5 text-right', tx.realizedPnl === undefined ? 'text-subtle' : tx.realizedPnl >= 0 ? 'text-primary' : 'text-danger')}>
                  {tx.realizedPnl === undefined ? '—' : formatSignedUsd(tx.realizedPnl)}
                </td>
                <td className="px-2 py-2.5 text-xs text-muted">{REASON_LABEL[tx.reason ?? 'manual']}</td>
                <td className="px-2 py-2.5 text-right text-xs whitespace-nowrap text-muted">{formatDateTime(tx.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
