import { ArrowDownLeft, ArrowUpRight, ChevronDown, Radar } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMarket } from '../../context/MarketContext';
import { useTrading } from '../../context/TradingContext';
import type { Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatCompactUsd, formatPercent, formatSignedUsd, formatUsd, initials } from '../../utils/format';
import { getSparkline } from '../../services/chartService';
import { MIN_OPPORTUNITY } from '../../services/tokenFilters';
import { EntryLevelsMobile } from '../token/EntryLevelsMobile';
import { PriceText } from '../ui/PriceText';
import { TokenAvatar } from '../ui/primitives';

type Range = '5m' | '1h' | '24h';

/** How many recorded price points each range spans, and what to call it. */
const WINDOWS: { value: Range; label: string; points: number }[] = [
  { value: '5m', label: '5 minutes', points: 10 },
  { value: '1h', label: 'hour', points: 60 },
  { value: '24h', label: '24 hours', points: 240 },
];

const BUCKETS = 7;

/**
 * One coin's recent prices as seven bars. Each bar is a slice of the window, its height the price
 * relative to the window's own range — the floor is 18% so a flat stretch still reads as bars and
 * not as a missing chart.
 */
function priceBars(history: number[]): { height: number; change: number }[] {
  if (history.length < 2) return [];
  const size = Math.max(1, Math.floor(history.length / BUCKETS));
  const slices: number[][] = [];
  for (let i = 0; i < BUCKETS; i++) {
    const slice = history.slice(i * size, i === BUCKETS - 1 ? undefined : (i + 1) * size);
    if (slice.length) slices.push(slice);
  }
  const closes = slices.map((s) => s[s.length - 1]);
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const span = hi - lo || hi || 1;
  return slices.map((s, i) => ({
    height: 18 + ((closes[i] - lo) / span) * 82,
    change: ((s[s.length - 1] - s[0]) / (s[0] || 1)) * 100,
  }));
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The phone's home screen. A wallet's shape — who you are, what you hold, what you can do, how it
 * moved, what is in it — because that order is already fluent to anyone who has opened one.
 */
export function MobileHome() {
  const { user } = useAuth();
  const { tokens } = useMarket();
  const { summary } = useTrading();
  const [range, setRange] = useState<Range>('1h');
  const [focusId, setFocusId] = useState<string | null>(null);

  const up = summary.pnl24h >= 0;
  const first = user?.name.split(' ')[0] ?? 'trader';

  // The chart follows one coin, as the reference does: the biggest by default, any of the top
  // dozen on request. Charting the whole market at once says nothing you can act on.
  // The entry card only considers coins the scoring engine has actually rated.
  const scored = useMemo(() => tokens.filter((t) => t.signal !== 'INSUFFICIENT DATA' && t.score >= MIN_OPPORTUNITY), [tokens]);

  // Only coins we have actually watched for a while can be charted; a coin detected a minute ago
  // has two price points and would draw two identical bars.
  const choices = useMemo(() => {
    const charted = tokens.filter((t) => t.marketCap > 0 && t.history.length >= BUCKETS * 2);
    return [...charted].sort((a, b) => b.marketCap - a.marketCap).slice(0, 12);
  }, [tokens]);
  const focus = useMemo(() => choices.find((t) => t.id === focusId) ?? choices[0], [choices, focusId]);
  const bars = useMemo(() => {
    if (!focus) return [];
    const points = WINDOWS.find((w) => w.value === range)?.points ?? 60;
    return priceBars(getSparkline(focus, points));
  }, [focus, range]);

  // One row shape either way: your positions when you hold any, otherwise the live market.
  const holding = summary.positions.some((p) => p.token);
  const rows = useMemo(() => {
    if (holding) {
      return summary.positions
        .filter((p) => p.token)
        .slice(0, 4)
        .map((p) => ({ token: p.token as Token, value: p.value, change: p.unrealizedPct }));
    }
    return tokens
      .filter((t) => t.marketCap > 0)
      .slice(0, 4)
      .map((t) => ({ token: t, value: t.marketCap, change: t.priceChange24h }));
  }, [holding, summary.positions, tokens]);

  return (
    <div className="space-y-5 pb-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold tracking-tight">Hey, {first}!</p>
          <p className="text-sm text-muted">{greeting(new Date().getHours())} 👋</p>
        </div>
        <Link
          to="/settings"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white"
          aria-label="Your account"
        >
          {initials(user?.name ?? 'MR')}
        </Link>
      </header>

      <section>
        <p className="text-xs text-muted">Current value</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <PriceText value={formatUsd(summary.totalValue)} className="text-4xl leading-none font-bold tracking-tight" />
          <span className={cn('text-xs font-semibold', up ? 'text-primary' : 'text-danger')}>
            ({formatPercent(summary.pnl24hPct)}) ({formatSignedUsd(summary.pnl24h)})
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <QuickAction to="/trade" icon={ArrowUpRight} label="Trade" />
          <QuickAction to="/tokens" icon={Radar} label="Scan" raised />
          <QuickAction to="/watchlist" icon={ArrowDownLeft} label="Watchlist" />
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <label className="relative inline-flex items-center rounded-full bg-mint pr-7 pl-3 text-xs font-semibold text-ink">
            <span className="sr-only">Charted coin</span>
            <select
              value={focus?.id ?? ''}
              onChange={(e) => setFocusId(e.target.value)}
              className="appearance-none bg-transparent py-1.5 pr-1 text-xs font-semibold text-ink focus:outline-none"
            >
              {choices.map((t) => (
                <option key={t.id} value={t.id}>
                  ${t.symbol}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5" aria-hidden />
          </label>
          <div className="flex items-center gap-1 rounded-full bg-surface-2 p-1" role="tablist" aria-label="Chart range">
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                role="tab"
                aria-selected={range === w.value}
                onClick={() => setRange(w.value)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold transition',
                  range === w.value ? 'bg-ink text-white' : 'text-muted',
                )}
              >
                {w.value}
              </button>
            ))}
          </div>
        </div>

        {bars.length > 1 ? (
          <>
            <div className="flex h-44 items-end justify-between gap-2">
              {bars.map((b, i) => (
                <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5 text-center">
                  <span className={cn('num truncate text-[9px] font-semibold', b.change >= 0 ? 'text-primary' : 'text-danger')}>
                    {formatPercent(b.change, 1)}
                  </span>
                  <span
                    className={cn('w-full rounded-t-lg rounded-b-sm', i === bars.length - 1 ? 'bg-ink' : 'bg-mint-deep')}
                    style={{ height: `${b.height}%` }}
                    aria-hidden
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[11px] text-muted">
              <span className="truncate">
                ${focus?.symbol} · {formatCompactUsd(focus?.marketCap ?? 0)} market cap
              </span>
              <span className="shrink-0">last {WINDOWS.find((w) => w.value === range)?.label}</span>
            </div>
          </>
        ) : (
          <p className="py-14 text-center text-sm text-muted">Collecting price history for ${focus?.symbol ?? 'this coin'}…</p>
        )}
      </section>

      <EntryLevelsMobile tokens={scored} />

      <section className="card-ink p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">{holding ? 'Your positions' : 'Live market'}</p>
          <Link to={holding ? '/portfolio' : '/tokens'} className="inline-flex items-center gap-0.5 text-xs text-[#9b9ba3]">
            View all <ChevronDown className="size-3.5" />
          </Link>
        </div>
        <ul className="space-y-1">
          {rows.map(({ token: t, value, change }) => (
            <li key={t.id}>
              <Link to={`/tokens/${t.id}`} className="flex items-center gap-3 rounded-2xl px-1 py-2.5">
                <TokenAvatar token={t} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{t.name || `$${t.symbol}`}</span>
                  <span className="block truncate text-[11px] text-[#74747c]">${t.symbol}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block text-sm font-semibold text-white">{formatCompactUsd(value)}</span>
                  <span className={cn('num block text-[11px]', change >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]')}>{formatPercent(change)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function QuickAction({ to, icon: Icon, label, raised }: { to: string; icon: typeof Radar; label: string; raised?: boolean }) {
  return (
    <Link to={to} className="group flex flex-col items-center gap-2">
      <span
        className={cn(
          'grid size-14 place-items-center rounded-full border transition group-active:scale-90',
          raised ? 'border-transparent bg-ink text-white shadow-(--shadow-raised)' : 'border-line bg-surface text-ink shadow-(--shadow-card)',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="text-[11px] font-medium text-muted">{label}</span>
    </Link>
  );
}
