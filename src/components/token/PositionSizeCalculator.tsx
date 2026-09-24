import { Calculator } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useTrading } from '../../context/TradingContext';
import { positionSize } from '../../services/portfolio';
import type { Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatPercent, formatPrice, formatQty, formatUsd } from '../../utils/format';

/** Balance → Risk % → Entry → Stop-loss → Position size → Maximum loss. */
export function PositionSizeCalculator({ token }: { token?: Token }) {
  const { summary } = useTrading();
  const { settings } = useSettings();
  const prefs = settings?.trading;
  const [balance, setBalance] = useState('');
  const [risk, setRisk] = useState('');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');

  useEffect(() => {
    setBalance(summary.totalValue ? summary.totalValue.toFixed(2) : '10000');
  }, [summary.totalValue > 0]);
  useEffect(() => {
    if (prefs) setRisk(String(prefs.riskPerTradePct));
  }, [prefs?.riskPerTradePct]);
  useEffect(() => {
    if (token?.price) {
      setEntry(String(Number(token.price.toPrecision(6))));
      setStop(String(Number((token.price * (1 - (prefs?.defaultStopLossPct ?? 25) / 100)).toPrecision(6))));
    }
  }, [token?.id]);

  const r = positionSize({ balance: Number(balance), riskPct: Number(risk), entry: Number(entry), stop: Number(stop), maxPositionPct: prefs?.maxPositionPct ?? 100 });
  const invalid = Number(stop) >= Number(entry) && entry !== '' && stop !== '';

  const field = (id: string, label: string, value: string, set: (v: string) => void, hint?: string) => (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} inputMode="decimal" className={cn('input num', id === 'calc-stop' && invalid && 'input-error')} value={value} onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ''))} />
      {hint && <p className="mt-1 text-[11px] text-subtle">{hint}</p>}
    </div>
  );

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Calculator className="size-4 text-accent" /> Position-size calculator
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {field('calc-balance', 'Balance (USD)', balance, setBalance)}
        {field('calc-risk', 'Risk per trade (%)', risk, setRisk)}
        {field('calc-entry', 'Entry price', entry, setEntry, token ? `$${token.symbol} live` : undefined)}
        {field('calc-stop', 'Stop-loss price', stop, setStop)}
      </div>
      {invalid && (
        <p role="alert" className="mt-2 text-xs text-danger">
          Stop-loss must be below entry for a long position.
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Out label="Risk amount" value={r ? formatUsd(r.riskAmount) : '—'} />
        <Out label="Position size" value={r ? `${formatQty(r.quantity)} units` : '—'} />
        <Out label="Position value" value={r ? `${formatUsd(r.positionValue)} (${formatPercent(r.positionPct, 1, false)})` : '—'} />
        <Out label="Maximum loss" value={r ? formatUsd(r.maxLoss) : '—'} tone="danger" />
      </div>
      {r && (
        <p className="mt-2 text-[11px] text-muted">
          Stop distance {formatPercent(r.stopDistancePct, 1, false)} · entry {formatPrice(Number(entry))} → stop {formatPrice(Number(stop))}
          {r.cappedByMax && <span className="text-warning"> · capped by max position size ({prefs?.maxPositionPct}%)</span>}. Excludes fees and slippage; meme coins can gap through stops.
        </p>
      )}
    </section>
  );
}

function Out({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="rounded-xl border border-line bg-bg-2/60 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn('num mt-1 truncate text-sm font-semibold', tone === 'danger' && 'text-danger')}>{value}</p>
    </div>
  );
}
