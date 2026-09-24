import { Plus, Search, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { WatchlistRow } from '../components/token/WatchlistRow';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ChangeText, PageHeader, Segmented, TokenAvatar } from '../components/ui/primitives';
import { ScoreBadge } from '../components/ui/ScoreBadge';
import { useMarket } from '../context/MarketContext';
import { useToast } from '../context/ToastContext';
import { useWatchlist } from '../context/WatchlistContext';
import { riskLevel } from '../../shared/riskEngine.ts';
import { matchesQuery, sortTokens } from '../services/tokenFilters';
import type { Token } from '../types';

type Filter = 'all' | 'gainers' | 'losers' | 'lowRisk' | 'highRisk';
type Sort = 'added' | 'score' | 'change' | 'risk' | 'price';

export default function WatchlistPage() {
  const { items, remove, add, clear, ids } = useWatchlist();
  const { getToken, tokens } = useMarket();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('added');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const rows = useMemo(() => {
    const list = items
      .map((i) => ({ item: i, token: getToken(i.tokenId) }))
      .filter((r): r is { item: (typeof items)[number]; token: Token } => !!r.token)
      .filter(({ token }) => {
        if (!matchesQuery(token, query)) return false;
        const lvl = riskLevel(token.riskScore);
        if (filter === 'gainers') return token.priceChange24h > 0;
        if (filter === 'losers') return token.priceChange24h < 0;
        if (filter === 'lowRisk') return lvl === 'Low' || lvl === 'Medium';
        if (filter === 'highRisk') return lvl === 'High' || lvl === 'Extreme';
        return true;
      });
    const key: Record<Sort, (r: (typeof list)[number]) => number> = {
      added: (r) => r.item.addedAt,
      score: (r) => r.token.score,
      change: (r) => r.token.priceChange24h,
      risk: (r) => r.token.riskScore,
      price: (r) => r.token.price,
    };
    return [...list].sort((a, b) => key[sort](b) - key[sort](a));
  }, [items, getToken, query, filter, sort]);

  const missing = items.filter((i) => !getToken(i.tokenId)).length;
  const candidates = useMemo(
    () => sortTokens(tokens.filter((t) => !ids.has(t.id) && matchesQuery(t, addQuery)), 'score', 'desc').slice(0, 12),
    [tokens, ids, addQuery],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Watchlist"
        subtitle={`${items.length} token${items.length === 1 ? '' : 's'} · synced to your account · always tracked live`}
        actions={
          <>
            <button className="btn btn-primary btn-sm" onClick={() => { setAddQuery(''); setAddOpen(true); }}>
              <Plus className="size-3.5" /> Add token
            </button>
            <button className="btn btn-outline btn-sm text-danger" onClick={() => setConfirmClear(true)} disabled={items.length === 0}>
              <Trash2 className="size-3.5" /> Clear
            </button>
          </>
        }
      />

      {items.length > 0 && (
        <div className="card space-y-3 p-3 sm:p-4">
          <Segmented
            label="Watchlist filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'gainers', label: 'Gainers' },
              { value: 'losers', label: 'Losers' },
              { value: 'lowRisk', label: 'Lower risk' },
              { value: 'highRisk', label: 'High risk' },
            ]}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <input type="search" className="input pl-9" placeholder="Search watchlist" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search watchlist" />
            </div>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort watchlist">
              <option value="added">Sort: Recently added</option>
              <option value="score">Sort: Score</option>
              <option value="change">Sort: 24h change</option>
              <option value="risk">Sort: Risk</option>
              <option value="price">Sort: Price</option>
            </select>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <EmptyState
            icon={Star}
            title="Your watchlist is empty"
            description="Star tokens from the market or add them here to track score, risk and price in one place."
            action={
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={() => setAddOpen(true)}>Add token</button>
                <Link to="/tokens" className="btn btn-outline">Browse market</Link>
              </div>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={Search} title="No matches" description="No watched tokens match these filters." action={<button className="btn btn-outline" onClick={() => { setFilter('all'); setQuery(''); }}>Reset</button>} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ item, token }) => (
              <WatchlistRow
                key={token.id}
                token={token}
                addedAt={item.addedAt}
                onRemove={() => {
                  remove(token.id)
                    .then(() => toast.info(`$${token.symbol} removed from watchlist`))
                    .catch(() => undefined);
                }}
              />
            ))}
          </ul>
        )}
        {missing > 0 && <p className="border-t border-line px-4 py-2 text-xs text-muted">{missing} watched token(s) are loading from market data — watched tokens are pinned and polled continuously.</p>}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add to watchlist" description="Search tracked tokens, or paste any Solana mint address to start tracking it.">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input className="input pl-9" placeholder="Symbol, name or paste a mint address" value={addQuery} onChange={(e) => setAddQuery(e.target.value)} data-autofocus aria-label="Search tokens to add" />
        </div>
        {/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addQuery.trim()) && !ids.has(addQuery.trim()) && (
          <button
            className="btn btn-outline mb-3 w-full"
            onClick={() => {
              add(addQuery.trim())
                .then(() => {
                  toast.success('Mint added — loading live data');
                  setAddOpen(false);
                })
                .catch(() => undefined);
            }}
          >
            <Plus className="size-4" /> Track mint {addQuery.trim().slice(0, 6)}…
          </button>
        )}
        {candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No tracked tokens match.</p>
        ) : (
          <ul className="-mx-2 max-h-80 space-y-0.5 overflow-y-auto">
            {candidates.map((t) => (
              <li key={t.id}>
                <button
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2"
                  onClick={() => {
                    add(t.id)
                      .then(() => toast.success(`$${t.symbol} added to watchlist`))
                      .catch(() => undefined);
                  }}
                >
                  <TokenAvatar token={t} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">${t.symbol}</span>
                    <ChangeText value={t.priceChange24h} className="text-[11px]" />
                  </span>
                  <ScoreBadge score={t.score} showMax={false} />
                  <Plus className="size-4 text-primary" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmModal
        open={confirmClear}
        title="Clear watchlist?"
        message="All tokens will be removed from your watchlist."
        confirmLabel="Clear watchlist"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clear();
          setConfirmClear(false);
          toast.success('Watchlist cleared');
        }}
      />
    </div>
  );
}
