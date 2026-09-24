import { SearchX } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConnectionDot } from '../components/layout/ConnectionStatus';
import { FilterBar } from '../components/token/FilterBar';
import { TokenTable } from '../components/token/TokenTable';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/primitives';
import { useMarket } from '../context/MarketContext';
import { applyFilters, DEFAULT_FILTERS, SORT_OPTIONS, type MarketTab, type SortKey, type TokenFilters } from '../services/tokenFilters';
import type { Signal } from '../types';

const TAB_SORT: Record<MarketTab, Pick<TokenFilters, 'sort' | 'dir'>> = {
  all: { sort: 'detectedAt', dir: 'desc' },
  new: { sort: 'detectedAt', dir: 'desc' },
  trending: { sort: 'volume5m', dir: 'desc' },
  gainers: { sort: 'priceChange5m', dir: 'desc' },
  losers: { sort: 'priceChange5m', dir: 'asc' },
};
const TABS = Object.keys(TAB_SORT) as MarketTab[];
const SIGNALS: Signal[] = ['WATCH', 'HIGH-RISK SETUP', 'AVOID', 'INSUFFICIENT DATA'];

function filtersFromParams(params: URLSearchParams): TokenFilters {
  const tab = TABS.includes(params.get('tab') as MarketTab) ? (params.get('tab') as MarketTab) : 'all';
  const sortParam = params.get('sort') as SortKey | null;
  const sort = SORT_OPTIONS.some((o) => o.value === sortParam) ? (sortParam as SortKey) : TAB_SORT[tab].sort;
  const signal = SIGNALS.includes(params.get('signal') as Signal) ? (params.get('signal') as Signal) : 'all';
  return {
    ...DEFAULT_FILTERS,
    query: params.get('q') ?? '',
    tab,
    signal,
    sort,
    dir: params.get('dir') === 'asc' ? 'asc' : params.get('dir') === 'desc' || sortParam ? 'desc' : TAB_SORT[tab].dir,
  };
}

export default function MarketPage() {
  const { tokens, lastUpdated } = useMarket();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<TokenFilters>(() => filtersFromParams(params));
  // Keep typing responsive while hundreds of rows re-filter on each live update.
  const deferredTokens = useDeferredValue(tokens);
  const deferredQuery = useDeferredValue(filters.query);

  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.query) next.set('q', filters.query);
    if (filters.tab !== 'all') next.set('tab', filters.tab);
    if (filters.signal !== 'all') next.set('signal', filters.signal);
    if (filters.sort !== TAB_SORT[filters.tab].sort || filters.dir !== TAB_SORT[filters.tab].dir) {
      next.set('sort', filters.sort);
      next.set('dir', filters.dir);
    }
    setParams(next, { replace: true });
  }, [filters, setParams]);

  const effective = useMemo(() => ({ ...filters, query: deferredQuery }), [filters, deferredQuery]);
  const results = useMemo(() => applyFilters(deferredTokens, effective), [deferredTokens, effective]);
  const counts = useMemo(
    () => Object.fromEntries(TABS.map((tab) => [tab, applyFilters(deferredTokens, { ...effective, tab }).length])) as Record<MarketTab, number>,
    [deferredTokens, effective],
  );

  const update = (patch: Partial<TokenFilters>) =>
    setFilters((f) => {
      const next = { ...f, ...patch };
      if (patch.tab && patch.tab !== f.tab && !patch.sort) Object.assign(next, TAB_SORT[patch.tab]);
      return next;
    });

  const onSort = (key: SortKey) => update(filters.sort === key ? { dir: filters.dir === 'asc' ? 'desc' : 'asc' } : { sort: key, dir: 'desc' });

  return (
    <div>
      <PageHeader
        title="Live tokens"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <ConnectionDot /> {tokens.length} tracked{lastUpdated ? ` · updated ${new Date(lastUpdated).toLocaleTimeString()}` : ''}
          </span>
        }
      />
      <div className="card mb-4 p-3 sm:p-4">
        <FilterBar filters={filters} onChange={update} counts={counts} resultCount={results.length} />
      </div>
      <div className="card overflow-hidden">
        {results.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={tokens.length ? 'No tokens match your filters' : 'Waiting for launches…'}
            description={tokens.length ? 'Try a different search term or loosen the filters.' : 'The feed fills as new tokens are detected.'}
            action={
              tokens.length ? (
                <button className="btn btn-outline" onClick={() => update({ ...DEFAULT_FILTERS })}>
                  Clear all filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <TokenTable tokens={results} sort={filters.sort} dir={filters.dir} onSort={onSort} height="max(380px, calc(100dvh - 21rem))" />
        )}
      </div>
    </div>
  );
}
