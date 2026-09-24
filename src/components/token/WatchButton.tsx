import { Star } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { useToast } from '../../context/ToastContext';
import { useWatchlist } from '../../context/WatchlistContext';
import type { Token } from '../../types';
import { cn } from '../../utils/cn';

export function WatchButton({ token, variant = 'icon', className }: { token: Pick<Token, 'id' | 'symbol'>; variant?: 'icon' | 'button'; className?: string }) {
  const { isWatched, toggle } = useWatchlist();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const watched = isWatched(token.id);

  const onClick = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const now = await toggle(token.id);
      if (now) toast.success(`$${token.symbol} added to watchlist`, 'You will get alerts when it enters/exits your watch conditions.');
      else toast.info(`$${token.symbol} removed from watchlist`);
    } catch {
      /* toast already shown by the context */
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'button') {
    return (
      <button onClick={onClick} aria-pressed={watched} disabled={busy} className={cn('btn btn-outline', watched && 'text-warning', className)}>
        <Star className={cn('size-4', watched && 'fill-warning text-warning')} aria-hidden />
        {watched ? 'Watching' : 'Add to Watchlist'}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      aria-pressed={watched}
      disabled={busy}
      aria-label={watched ? `Remove ${token.symbol} from watchlist` : `Add ${token.symbol} to watchlist`}
      className={cn('grid size-8 shrink-0 place-items-center rounded-lg transition hover:bg-surface-3', watched ? 'text-warning' : 'text-subtle hover:text-fg', className)}
    >
      <Star className={cn('size-4 transition', watched && 'scale-110 fill-warning')} />
    </button>
  );
}
