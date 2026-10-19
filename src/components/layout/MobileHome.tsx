import { ArrowDownLeft, ArrowUpRight, ChevronRight, Radar, ScanLine } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMarket } from '../../context/MarketContext';
import { useTrading } from '../../context/TradingContext';
import { getSparkline } from '../../services/chartService';
import { MIN_OPPORTUNITY } from '../../services/tokenFilters';
import type { Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatCompactUsd, formatPercent, formatSignedUsd, formatUsd, initials } from '../../utils/format';
import { EntryLevelsMobile } from '../token/EntryLevelsMobile';
import { PriceText } from '../ui/PriceText';
import { Sparkline, TokenAvatar } from '../ui/primitives';

type Range = '5m' | '1h' | '24h';

const WINDOWS: { value: Range; label: string; points: number }[] = [
  { value: '5m', label: '5 minutes', points: 10 },
  { value: '1h', label: 'hour', points: 60 },
  { value: '24h', label: '24 hours', points: 240 },
];

const BUCKETS = 7;

/**
 * One coin's recent prices as seven bars. Each bar is a slice of the window, its height the price
 * relative to the window's own range — the floor is 18% so a flat stretch still reads as bars.
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
  const flat = hi - lo < Math.max(hi, 1e-12) * 1e-6;
  return slices.map((s, i) => ({
    // A coin whose price has not moved is a flat line, not an empty card: without this every bar
    // lands on the 18% floor and three quarters of the chart is blank.
    height: flat ? 62 : 18 + ((closes[i] - lo) / (hi - lo)) * 82,
    change: ((s[s.length - 1] - s[0]) / (s[0] || 1)) * 100,
  }));
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The colours of the allocation bar, in order — enough for the slices we ever show. */
const SLICE = ['bg-primary', 'bg-accent', 'bg-violet', 'bg-warning', 'bg-info', 'bg-danger'];

/**
 * The phone's home screen, in the shape of the trading reference: a gradient card carrying the one
 * number that matters, the actions under your thumb, a chart you can scope, then what you hold.
 */
export function MobileHome() {
  const { user } = useAuth();
  const { tokens, stats } = useMarket();
  const { summary } = useTrading();
  const [range, setRange] = useState<Range>('1h');
  const [focusId, setFocusId] = useState<string | null>(null);

  const up = summary.pnl24h >= 0;
  const first = user?.name.split(' ')[0] ?? 'trader';

  const scored = useMemo(() => tokens.filter((t) => t.signal !== 'INSUFFICIENT DATA' && t.score >= MIN_OPPORTUNITY), [tokens]);

  // Only coins we have watched for a while can be charted; one detected a minute ago has two
  // price points and would draw two identical bars.
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

  // Your positions when you hold any, otherwise the live market — one row shape either way.
  const holding = summary.positions.some((p) => p.token);
  const rows = useMemo(() => {
    if (holding) {
      return summary.positions
        .filter((p) => p.token)
        .slice(0, 5)
        .map((p) => ({ token: p.token as Token, value: p.value, change: p.unrealizedPct }));
    }
    return tokens
      .filter((t) => t.marketCap > 0)
      .slice(0, 5)
      .map((t) => ({ token: t, value: t.marketCap, change: t.priceChange24h }));
  }, [holding, summary.positions, tokens]);

  // Allocation across what you hold, as the reference's segmented bar. Cash is the remainder.
  const allocation = useMemo(() => {
    const total = summary.totalValue || 1;
    const held = summary.positions
      .filter((p) => p.token && p.value > 0)
      .slice(0, 5)
      .map((p) => ({ label: `$${(p.token as Token).symbol}`, pct: (p.value / total) * 100 }));
    const cash = Math.max(0, 100 - held.reduce((s, h) => s + h.pct, 0));
    return cash > 0.5 ? [...held, { label: 'Cash', pct: cash }] : held;
  }, [summary]);

  return (
    <div className="space-y-4 pb-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold tracking-tight">Hey, {first}!</p>
          <p className="text-sm text-muted">{greeting(new Date().getHours())} 👋</p>
        </div>
        <Link to="/settings" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold ring-1 ring-line" aria-label="Your account">
          {initials(user?.name ?? 'MR')}
        </Link>
      </header>

      {/* The hero: one figure, lit. The reference puts its portfolio value on a gradient so the
          number reads before anything else on the screen. */}
      <section
        className="relative overflow-hidden rounded-[28px] p-5 text-white shadow-(--shadow-float)"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--color-hero-from), var(--color-hero-to))' }}
      >
        <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/15 blur-3xl" aria-hidden />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-white/70">Portfolio value</p>
            <PriceText value={formatUsd(summary.totalValue)} className="mt-1 block text-[34px] leading-none font-bold tracking-tight" decimalsClassName="text-white/60" />
          </div>
          <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', up ? 'bg-white/20 text-white' : 'bg-black/25 text-white')}>
            {formatPercent(summary.pnl24hPct)}
          </span>
        </div>
        <p className="relative mt-1.5 text-xs text-white/75">
          {formatSignedUsd(summary.pnl24h)} in the last 24h · {stats.totalTokens} coins tracked
        </p>

        {allocation.length > 0 && (
          <div className="relative mt-4">
            <div className="flex h-2 gap-1 overflow-hidden rounded-full">
              {allocation.map((a, i) => (
                <span key={a.label} className={cn('h-full rounded-full', a.pct > 0 && (i < SLICE.length ? SLICE[i] : 'bg-white/40'))} style={{ width: `${Math.max(2, a.pct)}%` }} aria-hidden />
              ))}
            </div>
            <p className="mt-1.5 truncate text-[11px] text-white/70">{allocation.map((a) => `${a.label} ${a.pct.toFixed(0)}%`).join(' · ')}</p>
          </div>
        )}
      </section>

      <div className="grid grid-cols-4 gap-2">
        <QuickAction to="/trade" icon={ArrowUpRight} label="Trade" />
        <QuickAction to="/tokens" icon={Radar} label="Scan" raised />
        <QuickAction to="/watchlist" icon={ArrowDownLeft} label="Watch" />
        <QuickAction to="/pro" icon={ScanLine} label="Pay" />
      </div>

      <section className="card p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <label className="relative inline-flex items-center rounded-full border border-line bg-surface-2 pr-7 pl-3 text-xs font-semibold">
            <span className="sr-only">Charted coin</span>
            <select value={focus?.id ?? ''} onChange={(e) => setFocusId(e.target.value)} className="appearance-none bg-transparent py-1.5 pr-1 text-xs font-semibold focus:outline-none">
              {choices.map((t) => (
                <option key={t.id} value={t.id}>
                  ${t.symbol}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-2.5 size-3.5 rotate-90" aria-hidden />
          </label>
          <div className="flex items-center gap-1 rounded-full border border-line bg-bg-2/70 p-1" role="tablist" aria-label="Chart range">
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                role="tab"
                aria-selected={range === w.value}
                onClick={() => setRange(w.value)}
                className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold transition', range === w.value ? 'bg-primary text-on-primary' : 'text-muted')}
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
                  <span className={cn('num truncate text-[9px] font-semibold', b.change >= 0 ? 'text-primary' : 'text-danger')}>{formatPercent(b.change, 1)}</span>
                  <span
                    className={cn('w-full rounded-t-lg rounded-b-sm', i === bars.length - 1 ? 'bg-primary' : b.change >= 0 ? 'bg-primary/35' : 'bg-danger/35')}
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

      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">{holding ? 'Your positions' : 'Live market'}</p>
          <Link to={holding ? '/portfolio' : '/tokens'} className="inline-flex items-center gap-0.5 text-xs text-muted hover:text-fg">
            View all <ChevronRight className="size-3.5" />
          </Link>
        </div>
        <ul className="divide-y divide-line/60">
          {rows.map(({ token: t, value, change }) => (
            <li key={t.id}>
              <Link to={`/tokens/${t.id}`} className="flex items-center gap-3 py-2.5">
                <TokenAvatar token={t} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.name || `$${t.symbol}`}</span>
                  <span className="block truncate text-[11px] text-muted">${t.symbol}</span>
                </span>
                <Sparkline data={getSparkline(t, 20)} className="hidden h-7 w-12 shrink-0 min-[400px]:block" positive={change >= 0} />
                <span className="shrink-0 text-right">
                  <span className="num block text-sm font-semibold">{formatCompactUsd(value)}</span>
                  <span className={cn('num block text-[11px]', change >= 0 ? 'text-primary' : 'text-danger')}>{formatPercent(change)}</span>
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
          'grid size-14 place-items-center rounded-2xl border transition group-active:scale-90',
          raised ? 'border-transparent bg-primary text-on-primary shadow-(--shadow-glow)' : 'border-line bg-surface-2 text-fg',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="text-[11px] font-medium text-muted">{label}</span>
    </Link>
  );
}
