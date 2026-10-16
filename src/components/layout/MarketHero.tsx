import { Bell, ChevronRight, Radar, Star, Zap, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMarket } from '../../context/MarketContext';
import { formatCompactUsd, formatNumber, formatPercent, formatUsd } from '../../utils/format';
import { PriceText } from '../ui/PriceText';

/**
 * The card the home screen opens with: one figure, how it moved, and the handful of places worth
 * going next. Shaped like a wallet's balance card because that is what people already read fluently.
 */
export function MarketHero() {
  const { stats, statsHistory, health, unreadCount } = useMarket();
  const live = health?.stream === 'open';

  // Change since the oldest point we still hold, so the figure has something to move against.
  const first = statsHistory[0]?.volume ?? 0;
  const delta = first > 0 ? stats.totalVolume - first : 0;
  const deltaPct = first > 0 ? (delta / first) * 100 : 0;
  const up = delta >= 0;

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-line bg-surface p-5 shadow-(--shadow-float)">
      {/* The brand light sits under the figure, the way the reference lights its balance card. */}
      <div
        className="pointer-events-none absolute -top-32 left-1/2 size-80 -translate-x-1/2 rounded-full opacity-70 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgb(34 224 122 / 0.28), transparent 70%)' }}
        aria-hidden
      />
      <div className="relative text-center">
        <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted">
          <span className={`size-1.5 rounded-full ${live ? 'animate-pulse-dot bg-primary' : 'bg-warning'}`} aria-hidden />
          24h market volume
        </p>

        <PriceText value={formatUsd(stats.totalVolume, 2)} className="mt-1.5 block text-[40px] leading-none font-bold tracking-tight sm:text-5xl" />

        <p className={`mt-2 inline-flex items-center gap-1 text-sm font-semibold ${up ? 'text-primary' : 'text-danger'}`}>
          {up ? '↗' : '↘'} {formatCompactUsd(Math.abs(delta))} ({formatPercent(deltaPct)})
        </p>

        <div className="mt-5 grid grid-cols-4 gap-2">
          <Action to="/tokens" icon={Radar} label="Coins" />
          <Action to="/tokens?tab=new" icon={Zap} label="New" />
          <Action to="/watchlist" icon={Star} label="Watchlist" />
          <Action to="/alerts" icon={Bell} label="Alerts" badge={unreadCount} />
        </div>
      </div>

      <div className="relative mt-5 flex items-center justify-between border-t border-line pt-3 text-xs">
        <span className="text-muted">
          <span className="num font-semibold text-fg">{formatNumber(stats.totalTokens)}</span> coins tracked ·{' '}
          <span className="num font-semibold text-primary">{formatNumber(stats.launchesLastHour)}</span>/h new
        </span>
        <Link to="/tokens" className="flex items-center gap-0.5 font-semibold text-fg">
          View all <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}

function Action({ to, icon: Icon, label, badge }: { to: string; icon: LucideIcon; label: string; badge?: number }) {
  return (
    <Link to={to} className="group flex flex-col items-center gap-1.5">
      <span className="relative grid size-12 place-items-center rounded-full border border-line bg-surface-2 transition group-active:scale-90">
        <Icon className="size-5" aria-hidden />
        {badge !== undefined && badge > 0 && (
          <span className="num absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="text-[11px] text-muted">{label}</span>
    </Link>
  );
}
