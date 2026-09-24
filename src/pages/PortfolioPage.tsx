import { ArrowLeftRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AllocationDonut, ALLOCATION_COLORS, type AllocationSlice } from '../components/charts/AllocationDonut';
import { PerformanceChart } from '../components/charts/PerformanceChart';
import { PositionList, TransactionList } from '../components/token/TradeLists';
import { KeyValue, PageHeader, Section, Segmented } from '../components/ui/primitives';
import { useTrading } from '../context/TradingContext';
import { cn } from '../utils/cn';
import { formatPercent, formatSignedUsd, formatUsd } from '../utils/format';

type Range = '24H' | '7D' | 'ALL';
const RANGE_MS: Record<Range, number> = { '24H': 86_400_000, '7D': 7 * 86_400_000, ALL: Infinity };

export default function PortfolioPage() {
  const { state, summary } = useTrading();
  const [range, setRange] = useState<Range>('ALL');

  const allocation = useMemo<AllocationSlice[]>(() => {
    const top = summary.positions.slice(0, 5).map((p, i) => ({ name: `$${p.symbol}`, value: p.value, color: ALLOCATION_COLORS[i] }));
    const rest = summary.positions.slice(5).reduce((s, p) => s + p.value, 0);
    const slices = [...top];
    if (rest > 0) slices.push({ name: 'Other tokens', value: rest, color: ALLOCATION_COLORS[5] });
    if (summary.cash > 0.01) slices.push({ name: 'Cash', value: summary.cash, color: ALLOCATION_COLORS[6] });
    return slices;
  }, [summary]);

  // Server-recorded equity snapshots + the live value as the final point.
  const perf = useMemo(() => {
    const from = Date.now() - RANGE_MS[range];
    const pts = state.equity.filter((p) => p.t >= from);
    return [...pts, { t: Date.now(), value: summary.totalValue }];
  }, [state.equity, range, summary.totalValue]);
  const perfChange = perf.length > 1 ? perf[perf.length - 1].value - perf[0].value : 0;

  const sells = state.transactions.filter((t) => t.side === 'sell' && t.realizedPnl !== undefined);
  const winRate = sells.length ? (sells.filter((t) => (t.realizedPnl ?? 0) > 0).length / sells.length) * 100 : null;
  const best = summary.positions.reduce<(typeof summary.positions)[number] | null>((b, p) => (!b || p.unrealizedPct > b.unrealizedPct ? p : b), null);
  const fees = state.transactions.reduce((s, t) => s + t.fee, 0);
  const largest = summary.positions[0];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Portfolio"
        subtitle="Paper portfolio valued at live prices"
        actions={
          <Link to="/trade" className="btn btn-primary btn-sm">
            <ArrowLeftRight className="size-3.5" /> Trade
          </Link>
        }
      />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <Section className="lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Total value</p>
              <p className="num text-3xl font-bold tracking-tight sm:text-4xl">{formatUsd(summary.totalValue)}</p>
              <p className={cn('num text-sm font-semibold', summary.totalPnl >= 0 ? 'text-primary' : 'text-danger')}>
                {formatSignedUsd(summary.totalPnl)} ({formatPercent(summary.totalPnlPct)}) all time
              </p>
            </div>
            <div className="rounded-xl border border-line bg-bg-2/60 px-4 py-3 text-right">
              <p className="text-xs text-muted">24h P/L</p>
              <p className={cn('num text-xl font-bold', summary.pnl24h >= 0 ? 'text-primary' : 'text-danger')}>{formatSignedUsd(summary.pnl24h)}</p>
            </div>
          </div>
          <div className="mt-5 mb-2 flex items-center justify-between gap-2">
            <p className="text-sm">
              Equity curve <span className={cn('num font-semibold', perfChange >= 0 ? 'text-primary' : 'text-danger')}>{formatSignedUsd(perfChange)}</span>
            </p>
            <Segmented label="Range" size="sm" value={range} onChange={setRange} options={(['24H', '7D', 'ALL'] as const).map((r) => ({ value: r, label: r }))} />
          </div>
          <PerformanceChart data={perf} baseline={state.startingBalance} height={240} />
          <p className="mt-2 text-[11px] text-muted">Snapshots are recorded by the server every 5 minutes while you hold positions, and after every trade.</p>
        </Section>
        <Section title="Allocation & exposure">
          <AllocationDonut data={allocation} total={summary.totalValue} height={200} />
          <ul className="mt-4 space-y-2">
            {allocation.map((a) => (
              <li key={a.name} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 rounded-full" style={{ background: a.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="num text-muted">{formatUsd(a.value, 0)}</span>
                <span className="num w-12 text-right font-semibold">{formatPercent((a.value / Math.max(summary.totalValue, 1)) * 100, 0, false)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <KeyValue label="Cash" value={formatUsd(summary.cash)} />
        <KeyValue label="Holdings" value={formatUsd(summary.holdingsValue)} />
        <KeyValue label="Exposure" value={formatPercent(summary.exposurePct, 1, false)} />
        <KeyValue label="Largest position" value={largest ? `$${largest.symbol} ${formatPercent(largest.exposurePct, 0, false)}` : '—'} />
        <KeyValue label="Unrealized" value={<span className={summary.unrealizedPnl >= 0 ? 'text-primary' : 'text-danger'}>{formatSignedUsd(summary.unrealizedPnl)}</span>} />
        <KeyValue label="Realized" value={<span className={summary.realizedPnl >= 0 ? 'text-primary' : 'text-danger'}>{formatSignedUsd(summary.realizedPnl)}</span>} />
        <KeyValue label="Win rate" value={winRate === null ? '—' : formatPercent(winRate, 0, false)} />
        <KeyValue label="Best position" value={best ? `$${best.symbol} ${formatPercent(best.unrealizedPct, 0)}` : '—'} />
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <Section title="Holdings">
          <PositionList positions={summary.positions} />
        </Section>
        <Section title="Transaction history" action={<span className="num text-xs text-muted">Fees paid {formatUsd(fees)}</span>}>
          <TransactionList transactions={state.transactions} limit={10} />
          {state.transactions.length > 10 && (
            <Link to="/trade?tab=history" className="mt-3 block text-center text-xs font-semibold text-primary hover:underline">
              View all {state.transactions.length} transactions
            </Link>
          )}
        </Section>
      </div>
    </div>
  );
}
