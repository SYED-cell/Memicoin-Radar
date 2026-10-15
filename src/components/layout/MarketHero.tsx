import { ArrowRight, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConnectionDot } from './ConnectionStatus';
import { useMarket } from '../../context/MarketContext';
import { formatCompactUsd, formatNumber } from '../../utils/format';

/**
 * The card the home screen opens with — the one figure that says whether the market is worth
 * looking at right now, the way a wallet app leads with a balance. Phone-first: it is the whole
 * top of the screen on mobile and settles into the grid on larger displays.
 */
export function MarketHero() {
  const { stats, lastUpdated } = useMarket();

  return (
    <section className="relative overflow-hidden rounded-3xl border border-line-strong bg-surface/70 p-4 shadow-(--shadow-float) backdrop-blur sm:p-5">
      {/* Brand light, kept behind the content and out of the way of pointer events. */}
      <div
        className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgb(34 224 122 / 0.35), transparent 70%)' }}
        aria-hidden
      />
      <div className="relative">
        {/* The dot carries its own status word, so the heading does not repeat it. */}
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-muted uppercase">
          <ConnectionDot /> <span>market</span>
        </p>
        <p className="display mt-1.5 text-4xl sm:text-5xl">{formatCompactUsd(stats.totalVolume)}</p>
        <p className="mt-1 text-xs text-muted">
          24h volume across {formatNumber(stats.totalTokens)} tracked coins
          {lastUpdated ? ` · updated ${new Date(lastUpdated).toLocaleTimeString()}` : ''}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2">
          <Figure label="Liquidity" value={formatCompactUsd(stats.totalLiquidity)} />
          <Figure label="New / hour" value={formatNumber(stats.launchesLastHour)} tone="text-primary" />
          <Figure label="Tracked" value={formatNumber(stats.totalTokens)} />
        </dl>

        <div className="mt-4 flex gap-2">
          <Link to="/tokens" className="btn btn-primary btn-sm flex-1">
            Browse coins <ArrowRight className="size-3.5" />
          </Link>
          <Link to="/tokens?tab=new" className="btn btn-outline btn-sm flex-1">
            <Radio className="size-3.5" /> New launches
          </Link>
        </div>
      </div>
    </section>
  );
}

function Figure({ label, value, tone = 'text-fg' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg-2/60 px-2.5 py-2">
      <dt className="text-[10px] tracking-wide text-muted uppercase">{label}</dt>
      <dd className={`num truncate text-sm font-bold ${tone}`}>{value}</dd>
    </div>
  );
}
