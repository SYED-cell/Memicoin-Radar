import { ArrowDownWideNarrow, ArrowUpNarrowWide, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_FILTERS, SORT_OPTIONS, type MarketTab, type TokenFilters } from '../../services/tokenFilters';
import type { RiskLevel, Signal } from '../../types';
import { cn } from '../../utils/cn';
import { Segmented } from '../ui/primitives';

interface FilterBarProps {
  filters: TokenFilters;
  onChange: (patch: Partial<TokenFilters>) => void;
  counts?: Partial<Record<MarketTab, number>>;
  resultCount: number;
}

const TABS: { value: MarketTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'trending', label: 'Trending' },
  { value: 'gainers', label: 'Gainers' },
  { value: 'losers', label: 'Losers' },
];
const SIGNALS: (Signal | 'all')[] = ['all', 'WATCH', 'HIGH-RISK SETUP', 'AVOID', 'INSUFFICIENT DATA'];
const MIN_LIQ = [0, 5_000, 20_000, 50_000, 100_000];
const RISKS: (RiskLevel | 'all')[] = ['all', 'Low', 'Medium', 'High', 'Extreme'];
const MIN_SCORES = [0, 50, 65, 75, 85];

export function FilterBar({ filters, onChange, counts, resultCount }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const activeAdvanced = (filters.signal !== 'all' ? 1 : 0) + (filters.minLiquidity > 0 ? 1 : 0) + (filters.risk !== 'all' ? 1 : 0) + (filters.minScore > 0 ? 1 : 0);
  const isDirty = JSON.stringify({ ...filters, tab: 'all' }) !== JSON.stringify({ ...DEFAULT_FILTERS, tab: 'all' });

  return (
    <div className="space-y-3">
      {/* One row of chrome: search, and the door to everything else. Sorting lives behind it —
          it is changed occasionally, so it does not deserve permanent space on a phone. */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Search symbol, name, mint or creator address"
            aria-label="Search tokens"
            className="input pr-9 pl-9"
          />
          {filters.query && (
            <button onClick={() => onChange({ query: '' })} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <button
          className={cn('btn btn-outline relative shrink-0 px-3', open && 'border-primary text-primary')}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="advanced-filters"
          aria-label="Sort and filter"
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeAdvanced > 0 && <span className="num grid size-4 place-items-center rounded-full bg-primary text-[10px] text-on-primary">{activeAdvanced}</span>}
        </button>
      </div>

      {open && (
        <div id="advanced-filters" className="grid animate-slide-up grid-cols-1 gap-3 rounded-2xl border border-line bg-bg-2/60 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="label" htmlFor="sort-select">
              Sort by
            </label>
            <div className="flex gap-2">
              <select id="sort-select" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as TokenFilters['sort'] })} className="input min-w-0 flex-1">
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-outline shrink-0 px-3"
                onClick={() => onChange({ dir: filters.dir === 'asc' ? 'desc' : 'asc' })}
                aria-label={filters.dir === 'asc' ? 'Sorted ascending, switch to descending' : 'Sorted descending, switch to ascending'}
              >
                {filters.dir === 'asc' ? <ArrowUpNarrowWide className="size-4" /> : <ArrowDownWideNarrow className="size-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="signal-filter">Signal</label>
            <select id="signal-filter" className="input" value={filters.signal} onChange={(e) => onChange({ signal: e.target.value as TokenFilters['signal'] })}>
              {SIGNALS.map((c) => (
                <option key={c} value={c}>{c === 'all' ? 'Any signal' : c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="liq-filter">Minimum liquidity</label>
            <select id="liq-filter" className="input" value={filters.minLiquidity} onChange={(e) => onChange({ minLiquidity: Number(e.target.value) })}>
              {MIN_LIQ.map((l) => (
                <option key={l} value={l}>{l === 0 ? 'Any liquidity' : `$${l / 1000}K+`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="risk-filter">Risk level</label>
            <select id="risk-filter" className="input" value={filters.risk} onChange={(e) => onChange({ risk: e.target.value as TokenFilters['risk'] })}>
              {RISKS.map((r) => (
                <option key={r} value={r}>{r === 'all' ? 'Any risk' : r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="score-filter">Minimum score</label>
            <select id="score-filter" className="input" value={filters.minScore} onChange={(e) => onChange({ minScore: Number(e.target.value) })}>
              {MIN_SCORES.map((s) => (
                <option key={s} value={s}>{s === 0 ? 'Any score' : `${s}+`}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Tabs and the result count share one line — a whole row for a single number costs a row
          of coins. The tabs scroll; the count stays put. */}
      <div className="flex items-center gap-3">
        <Segmented
          label="Token category"
          options={TABS.map((t) => ({ ...t, count: counts?.[t.value] }))}
          value={filters.tab}
          onChange={(tab) => onChange({ tab })}
          className="min-w-0 flex-1 sm:max-w-2xl"
        />
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
          <span className="hidden min-[400px]:inline">
            <span className="num font-semibold text-fg">{resultCount}</span> tokens
          </span>
          {isDirty && (
            <button onClick={() => onChange({ ...DEFAULT_FILTERS, tab: filters.tab })} className="inline-flex items-center gap-1 text-accent hover:underline" aria-label="Reset filters">
              <RotateCcw className="size-3" /> <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
