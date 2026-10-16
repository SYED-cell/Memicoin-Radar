import { MoreVertical, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getSparkline } from '../../services/chartService';
import type { Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatCompactUsd, formatPercent } from '../../utils/format';
import { PriceText } from '../ui/PriceText';
import { Sparkline, TokenAvatar } from '../ui/primitives';

/**
 * One coin, given room: the pair, the figure, how it moved and its shape over the last hour.
 * A row of these is the desktop's opening statement before the full table.
 */
export function CoinSpotlight({ token }: { token: Token }) {
  const change = token.priceChange1h ?? token.priceChange5m ?? 0;
  const up = change >= 0;
  const spark = getSparkline(token, 40);

  return (
    <article className="card relative w-[300px] shrink-0 overflow-hidden p-5 transition hover:border-line-strong">
      {/* The accent edge picks up the direction, the way the reference marks each card. */}
      <span className={cn('absolute top-5 bottom-5 left-0 w-1 rounded-r-full', up ? 'bg-primary' : 'bg-danger')} aria-hidden />

      <header className="flex items-start gap-3">
        <TokenAvatar token={token} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] tracking-wide text-muted uppercase">${token.symbol}/SOL</p>
          <Link to={`/tokens/${token.id}`} className="block truncate font-semibold hover:text-primary">
            {token.name || `$${token.symbol}`}
          </Link>
        </div>
        <Link
          to={`/tokens/${token.id}`}
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition hover:text-fg"
          aria-label={`Open ${token.symbol}`}
        >
          <MoreVertical className="size-4" aria-hidden />
        </Link>
      </header>

      <p className="mt-4 text-[11px] text-muted">Market cap</p>
      <PriceText value={formatCompactUsd(token.marketCap)} className="block text-3xl leading-none font-bold tracking-tight" />

      <p
        className={cn(
          'mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
          up ? 'bg-primary/12 text-primary' : 'bg-danger/12 text-danger',
        )}
      >
        {up ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
        {formatPercent(change)}
      </p>

      <Sparkline data={spark} className="mt-4 h-16 w-full" positive={up} />
    </article>
  );
}
