import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMarket } from '../../context/MarketContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useTrading } from '../../context/TradingContext';
import { ApiError } from '../../lib/api';
import { positionSize } from '../../services/portfolio';
import type { TradeSide } from '../../types';
import { cn } from '../../utils/cn';
import { formatPercent, formatPrice, formatQty, formatUsd } from '../../utils/format';
import { Modal } from '../ui/Modal';
import { DemoNotice, Segmented, Toggle, TokenAvatar } from '../ui/primitives';

interface TradingModalProps {
  open: boolean;
  onClose: () => void;
  tokenId?: string;
  initialSide?: TradeSide;
}

type Mode = 'usd' | 'qty' | 'risk';
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
const FALLBACK_PREFS = { riskPerTradePct: 1, maxPositionPct: 10, defaultStopLossPct: 25, defaultTakeProfitPct: 60 };

export function TradingModal({ open, onClose, tokenId, initialSide = 'buy' }: TradingModalProps) {
  const { tokens, getToken } = useMarket();
  const { state, summary, positionFor, execute, quote, fee, slippage } = useTrading();
  const { settings } = useSettings();
  const toast = useToast();
  const prefs = settings?.trading ?? FALLBACK_PREFS;

  const [side, setSide] = useState<TradeSide>(initialSide);
  const [selectedId, setSelectedId] = useState(tokenId ?? '');
  const [mode, setMode] = useState<Mode>('usd');
  const [amount, setAmount] = useState('');
  const [useOrders, setUseOrders] = useState(true);
  const [stopPct, setStopPct] = useState(String(prefs.defaultStopLossPct));
  const [tpPct, setTpPct] = useState(String(prefs.defaultTakeProfitPct));
  const [riskPct, setRiskPct] = useState(String(prefs.riskPerTradePct));
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setSide(initialSide);
    setSelectedId(tokenId ?? state.positions[0]?.tokenId ?? tokens.find((t) => t.price > 0)?.id ?? '');
    setMode('usd');
    setAmount('');
    setTouched(false);
    setSubmitting(false);
    setServerError(null);
    setUseOrders(true);
    setStopPct(String(prefs.defaultStopLossPct));
    setTpPct(String(prefs.defaultTakeProfitPct));
    setRiskPct(String(prefs.riskPerTradePct));
  }, [open]); // intentionally only on open

  const token = getToken(selectedId);
  const position = token ? positionFor(token.id) : undefined;
  const tradable = useMemo(() => tokens.filter((t) => t.price > 0 && t.marketUpdatedAt).sort((a, b) => a.symbol.localeCompare(b.symbol)), [tokens]);

  const price = token?.price ?? 0;
  const stopPrice = side === 'buy' && useOrders && num(stopPct) > 0 && num(stopPct) < 100 ? price * (1 - num(stopPct) / 100) : undefined;
  const tpPrice = side === 'buy' && useOrders && num(tpPct) > 0 ? price * (1 + num(tpPct) / 100) : undefined;
  const sizing = mode === 'risk' && stopPrice ? positionSize({ balance: summary.totalValue, riskPct: num(riskPct), entry: price, stop: stopPrice, maxPositionPct: prefs.maxPositionPct }) : null;

  const n = num(amount);
  let quantity = 0;
  if (token && price > 0) {
    if (mode === 'risk') quantity = sizing?.quantity ?? 0;
    else if (n > 0) quantity = mode === 'qty' ? n : n / (price * (side === 'buy' ? (1 + slippage) * (1 + fee) : 1 - slippage));
  }
  const q = token && quantity > 0 ? quote(side, token, quantity) : null;
  const maxPositionValue = (summary.totalValue * prefs.maxPositionPct) / 100;
  const existingValue = position ? position.quantity * price : 0;

  let error: string | null = null;
  if (!token) error = 'Select a token with live market data.';
  else if (!(price > 0)) error = 'No live price yet for this token.';
  else if (mode === 'risk' && !stopPrice) error = 'Risk-based sizing needs a stop-loss.';
  else if (mode === 'risk' && !(num(riskPct) > 0)) error = 'Enter a risk % above 0.';
  else if (mode !== 'risk' && !(n > 0)) error = 'Enter an amount greater than zero.';
  else if (side === 'buy' && q && -q.net > state.cash + 1e-9) error = `Insufficient paper balance — you have ${formatUsd(state.cash)}.`;
  else if (side === 'buy' && q && existingValue + q.total > maxPositionValue + 1e-6) error = `Exceeds your max position size (${prefs.maxPositionPct}% of equity = ${formatUsd(maxPositionValue)}).`;
  else if (side === 'sell' && !position) error = `You don't hold $${token.symbol}.`;
  else if (side === 'sell' && position && quantity > position.quantity * 1.000001) error = `You only hold ${formatQty(position.quantity)} $${token.symbol}.`;

  const setPercent = (pct: number) => {
    setTouched(true);
    if (!token || !price) return;
    if (side === 'sell') {
      setMode('qty');
      setAmount(String(Number(((position?.quantity ?? 0) * pct).toPrecision(10))));
      return;
    }
    const cap = Math.min(state.cash, Math.max(0, maxPositionValue - existingValue) * (1 + fee));
    setMode('usd');
    setAmount((Math.floor(cap * pct * 100) / 100).toString());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (error || !token || !q) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const sellAll = side === 'sell' && position && quantity >= position.quantity * 0.9999;
      const tx = await execute({
        side,
        token,
        quantity: sellAll && position ? position.quantity : quantity,
        stopLoss: side === 'buy' ? stopPrice : undefined,
        takeProfit: side === 'buy' ? tpPrice : undefined,
      });
      toast.success(
        `${side === 'buy' ? 'Bought' : 'Sold'} ${formatQty(tx.quantity)} $${token.symbol} (paper)`,
        `at ${formatPrice(tx.price)} · ${formatUsd(tx.total)}${tx.realizedPnl !== undefined ? ` · P/L ${formatUsd(tx.realizedPnl)}` : ''}`,
      );
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Order failed — please retry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Paper trade"
      description="Simulated order at the live price — no wallet or real funds involved."
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="trade-form" className={cn('btn min-w-36', side === 'buy' ? 'btn-primary' : 'btn-danger')} disabled={submitting}>
            {submitting ? 'Placing…' : `${side === 'buy' ? 'Buy' : 'Sell'}${token ? ` $${token.symbol}` : ''}`}
          </button>
        </>
      }
    >
      <form id="trade-form" onSubmit={submit} noValidate className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <Segmented
            label="Order side"
            value={side}
            onChange={(s) => {
              setSide(s);
              setAmount('');
              setTouched(false);
              if (s === 'sell' && mode === 'risk') setMode('qty');
            }}
            options={[
              { value: 'buy', label: 'Buy' },
              { value: 'sell', label: 'Sell' },
            ]}
          />

          <div>
            <label className="label" htmlFor="trade-token">
              Token
            </label>
            <div className="flex items-center gap-2">
              {token && <TokenAvatar token={token} size="sm" />}
              <select id="trade-token" className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={!!tokenId}>
                {!token && <option value="">Select…</option>}
                {(token && !tradable.includes(token) ? [token, ...tradable] : tradable).map((t) => (
                  <option key={t.id} value={t.id}>
                    ${t.symbol} — {formatPrice(t.price)}
                  </option>
                ))}
              </select>
            </div>
            {token && (
              <p className="mt-1.5 text-xs text-muted">
                Live {formatPrice(price)}
                {token.priceChange5m !== null && (
                  <>
                    {' '}· 5m <span className={token.priceChange5m >= 0 ? 'text-primary' : 'text-danger'}>{formatPercent(token.priceChange5m)}</span>
                  </>
                )}
                {position && <> · Holding {formatQty(position.quantity)}</>} · Risk {token.riskScore}/100
              </p>
            )}
          </div>

          <div>
            <Segmented
              label="Sizing mode"
              size="sm"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setAmount('');
              }}
              options={
                side === 'buy'
                  ? [
                      { value: 'usd', label: 'USD' },
                      { value: 'qty', label: 'Quantity' },
                      { value: 'risk', label: 'Risk %' },
                    ]
                  : [
                      { value: 'usd', label: 'USD' },
                      { value: 'qty', label: 'Quantity' },
                    ]
              }
            />
            {mode === 'risk' ? (
              <div className="mt-2">
                <label className="label" htmlFor="risk-pct">
                  Risk per trade (% of {formatUsd(summary.totalValue)} equity)
                </label>
                <input id="risk-pct" inputMode="decimal" className="input num" value={riskPct} onChange={(e) => setRiskPct(e.target.value.replace(/[^0-9.]/g, ''))} />
              </div>
            ) : (
              <div className="mt-2">
                <label className="label" htmlFor="trade-amount">
                  {mode === 'usd' ? (side === 'buy' ? 'Spend (USD, incl. fees)' : 'Receive (USD)') : 'Quantity'}
                </label>
                <input
                  id="trade-amount"
                  inputMode="decimal"
                  className={cn('input num text-base', touched && error && 'input-error')}
                  placeholder={mode === 'usd' ? '0.00' : '0'}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(/[^0-9.]/g, ''));
                    setTouched(true);
                  }}
                  aria-invalid={touched && !!error}
                  aria-describedby="trade-error"
                  data-autofocus
                />
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {[0.25, 0.5, 0.75, 1].map((p) => (
                    <button key={p} type="button" onClick={() => setPercent(p)} className="btn btn-outline btn-sm">
                      {p === 1 ? 'Max' : `${p * 100}%`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {side === 'buy' && (
            <div className="rounded-xl border border-line bg-bg-2/60 px-3 pb-3">
              <Toggle label="Stop-loss & take-profit" description="Enforced by the server, even while you're offline" checked={useOrders} onChange={setUseOrders} />
              {useOrders && (
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div>
                    <label className="label" htmlFor="sl-pct">
                      Stop-loss (−%)
                    </label>
                    <input id="sl-pct" inputMode="decimal" className="input num" value={stopPct} onChange={(e) => setStopPct(e.target.value.replace(/[^0-9.]/g, ''))} />
                    {stopPrice && <p className="num mt-1 text-[11px] text-danger">{formatPrice(stopPrice)}</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor="tp-pct">
                      Take-profit (+%)
                    </label>
                    <input id="tp-pct" inputMode="decimal" className="input num" value={tpPct} onChange={(e) => setTpPct(e.target.value.replace(/[^0-9.]/g, ''))} />
                    {tpPrice && <p className="num mt-1 text-[11px] text-primary">{formatPrice(tpPrice)}</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <dl className="space-y-1.5 rounded-xl border border-line bg-bg-2/60 p-3 text-sm">
            <Row label="Execution price" value={q ? formatPrice(q.executionPrice) : '—'} hint="incl. slippage" />
            <Row label="Quantity" value={q ? formatQty(q.quantity) : '—'} />
            <Row label="Subtotal" value={q ? formatUsd(q.total) : '—'} />
            <Row label={`Fee (${(fee * 100).toFixed(1)}%)`} value={q ? formatUsd(q.fee) : '—'} />
            <div className="my-1 border-t border-line" />
            <Row label={side === 'buy' ? 'Total cost' : 'You receive'} value={q ? formatUsd(Math.abs(q.net)) : '—'} strong />
            <Row label="Cash after" value={formatUsd(state.cash + (q && !error ? q.net : 0))} />
            {side === 'buy' && q && stopPrice && <Row label="Max loss at stop" value={formatUsd(q.quantity * (q.executionPrice - stopPrice) + q.fee)} tone="danger" />}
            {side === 'buy' && q && <Row label="Position size" value={`${formatPercent(((existingValue + q.total) / Math.max(summary.totalValue, 1)) * 100, 1, false)} of equity`} />}
          </dl>
          {sizing?.cappedByMax && <p className="text-[11px] text-warning">Capped by your max position size ({prefs.maxPositionPct}% of equity).</p>}
          {(touched && error) || serverError ? (
            <p id="trade-error" role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger">
              {serverError ?? error}
            </p>
          ) : null}
          <DemoNotice>
            Paper trading only: live prices, simulated fills ({(fee * 100).toFixed(1)}% fee + {(slippage * 100).toFixed(1)}% slippage). This app never asks for wallet keys or real funds.
          </DemoNotice>
        </div>
      </form>
    </Modal>
  );
}

function Row({ label, value, hint, strong, tone }: { label: string; value: string; hint?: string; strong?: boolean; tone?: 'danger' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">
        {label} {hint && <span className="text-[10px] text-subtle">({hint})</span>}
      </dt>
      <dd className={cn('num', strong && 'font-bold text-fg', tone === 'danger' && 'text-danger')}>{value}</dd>
    </div>
  );
}
