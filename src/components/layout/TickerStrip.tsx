import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMarket } from '../../context/MarketContext';
import type { Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatCompactUsd, formatPercent } from '../../utils/format';

/**
 * Scrolling strip of the newest launches — the pulse of the feed, the way a trading desk keeps a
 * tape running. The list is rendered twice so the loop never shows a gap, and the whole thing
 * holds still for anyone who asked for reduced motion.
 */
export function TickerStrip({ limit = 18 }: { limit?: number }) {
  const { tokens } = useMarket();
  const items = useMemo(() => tokens.slice(0, limit), [tokens, limit]);
  if (items.length < 4) return null;

  // Longer lists need proportionally longer to pass, or they appear to speed up.
  const seconds = Math.max(30, items.length * 3.5);

  return (
    <div className="relative overflow-hidden border-y border-line bg-bg-2/60">
      {/* Edges fade so items enter and leave instead of being cut off. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-bg-2 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-bg-2 to-transparent" aria-hidden />
      <div
        className="flex w-max motion-safe:animate-ticker motion-safe:hover:[animation-play-state:paused]"
        style={{ animationDuration: `${seconds}s` }}
      >
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
            {items.map((t) => (
              <TickerItem key={`${copy}-${t.id}`} token={t} />
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

function TickerItem({ token }: { token: Token }) {
  const change = token.priceChange5m ?? token.priceChange1h ?? 0;
  const up = change >= 0;
  return (
    <li>
      <Link to={`/tokens/${token.id}`} className="flex items-center gap-2 px-3.5 py-2 text-xs transition hover:bg-surface-2/60">
        <span className="font-semibold">${token.symbol.slice(0, 10)}</span>
        <span className="num text-muted">{formatCompactUsd(token.marketCap)}</span>
        <span className={cn('num font-semibold', up ? 'text-primary' : 'text-danger')}>
          {up ? '▲' : '▼'} {formatPercent(Math.abs(change), 1, false)}
        </span>
      </Link>
    </li>
  );
}
