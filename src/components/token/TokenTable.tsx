import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { SortDir, SortKey } from '../../services/tokenFilters';
import type { Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatAge, formatCompact, formatCompactUsd, formatPrice } from '../../utils/format';
import { ChangeText, NewBadge, SignalBadge, TokenAvatar } from '../ui/primitives';
import { RiskBadge } from '../ui/RiskBadge';
import { ScoreBadge } from '../ui/ScoreBadge';
import { VirtualList } from '../ui/VirtualList';
import { WatchButton } from './WatchButton';

interface TokenTableProps {
  tokens: Token[];
  sort?: SortKey;
  dir?: SortDir;
  onSort?: (key: SortKey) => void;
  height?: CSSProperties['height'];
}

interface Col {
  key: SortKey;
  label: string;
  className: string;
  cell: (t: Token) => React.ReactNode;
}

const COLS: Col[] = [
  { key: 'createdAt', label: 'Age', className: 'hidden w-16 lg:block', cell: (t) => <span className="num text-muted">{formatAge(t.createdAt)}</span> },
  { key: 'price', label: 'Price', className: 'w-24', cell: (t) => <span key={t.updatedAt} className="num animate-flash rounded px-1">{t.price ? formatPrice(t.price) : '—'}</span> },
  { key: 'priceChange5m', label: '5m', className: 'w-16', cell: (t) => (t.priceChange5m === null ? <span className="text-subtle">—</span> : <ChangeText value={t.priceChange5m} />) },
  { key: 'marketCap', label: 'MCap', className: 'hidden w-20 xl:block', cell: (t) => <span className="num text-muted">{t.marketCap ? formatCompactUsd(t.marketCap) : '—'}</span> },
  { key: 'liquidity', label: 'Liq', className: 'hidden w-20 xl:block', cell: (t) => <span className="num text-muted">{t.liquidity ? formatCompactUsd(t.liquidity) : '—'}</span> },
  { key: 'volume5m', label: 'Vol 5m', className: 'hidden w-20 2xl:block', cell: (t) => <span className="num text-muted">{formatCompactUsd(t.volume5m)}</span> },
  { key: 'holders', label: 'Holders', className: 'hidden w-16 3xl:block', cell: (t) => <span className="num text-muted">{formatCompact(t.holders)}</span> },
  { key: 'score', label: 'Opp.', className: 'w-14', cell: (t) => (t.signal === 'INSUFFICIENT DATA' ? <span className="text-subtle">—</span> : <ScoreBadge score={t.score} showMax={false} />) },
  { key: 'riskScore', label: 'Risk', className: 'hidden w-24 lg:block', cell: (t) => (t.signal === 'INSUFFICIENT DATA' ? <span className="text-subtle">—</span> : <RiskBadge risk={t.riskScore} compact />) },
];

const ROW = 56;

/** Virtualized live token table: compact list on phones, sortable columns on larger screens. */
export function TokenTable({ tokens, sort, dir, onSort, height = '70dvh' }: TokenTableProps) {
  const wide = useMediaQuery('(min-width: 768px)');

  if (!wide) {
    return (
      <VirtualList
        items={tokens}
        rowHeight={64}
        height={height}
        ariaLabel="Tokens"
        getKey={(t) => t.id}
        renderRow={(t) => (
          <Link to={`/tokens/${t.id}`} className="flex h-full items-center gap-3 border-b border-line px-3 transition active:bg-surface-2">
            <TokenAvatar token={t} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                ${t.symbol} <NewBadge detectedAt={t.detectedAt} />
              </p>
              <p className="flex items-center gap-1.5 truncate text-[11px] text-muted">
                <SignalBadge signal={t.signal} short /> {formatAge(t.createdAt)} · {t.marketCap ? formatCompactUsd(t.marketCap) : 'pricing…'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p key={t.updatedAt} className="num animate-flash rounded px-1 text-sm">{t.price ? formatPrice(t.price) : '—'}</p>
              {t.priceChange5m !== null && <ChangeText value={t.priceChange5m} className="px-1 text-xs" />}
            </div>
          </Link>
        )}
      />
    );
  }

  const header = (
    <div className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b border-line bg-surface/95 px-3 text-xs text-muted backdrop-blur" role="row">
      <span className="min-w-0 flex-1">Token</span>
      {COLS.map((c) => (
        <span key={c.key} className={cn('shrink-0 text-right', c.className)} aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
          {onSort ? (
            <button onClick={() => onSort(c.key)} className={cn('inline-flex items-center gap-1 hover:text-fg', sort === c.key && 'text-fg')}>
              {c.label}
              {sort === c.key ? dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
            </button>
          ) : (
            c.label
          )}
        </span>
      ))}
      <span className="w-28 shrink-0 text-right">Signal</span>
      <span className="w-8 shrink-0" />
    </div>
  );

  return (
    <VirtualList
      items={tokens}
      rowHeight={ROW}
      height={height}
      header={header}
      ariaLabel="Tokens"
      getKey={(t) => t.id}
      renderRow={(t) => (
        <div className="group flex h-full items-center gap-2 border-b border-line/60 px-3 text-sm transition hover:bg-surface-2/70">
          <Link to={`/tokens/${t.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
            <TokenAvatar token={t} size="sm" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 truncate font-semibold group-hover:text-primary">
                ${t.symbol} <NewBadge detectedAt={t.detectedAt} />
              </span>
              <span className="block truncate text-[11px] text-muted">
                {t.name} · {t.launchpad}
              </span>
            </span>
          </Link>
          {COLS.map((c) => (
            <span key={c.key} className={cn('shrink-0 text-right', c.className)}>
              {c.cell(t)}
            </span>
          ))}
          <span className="w-28 shrink-0 text-right">
            <SignalBadge signal={t.signal} short />
          </span>
          <span className="w-8 shrink-0">
            <WatchButton token={t} />
          </span>
        </div>
      )}
    />
  );
}
