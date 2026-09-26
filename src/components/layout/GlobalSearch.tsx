import { Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarket } from '../../context/MarketContext';
import { matchesQuery, sortTokens } from '../../services/tokenFilters';
import { cn } from '../../utils/cn';
import { formatCompactUsd } from '../../utils/format';
import { ChangeText, TokenAvatar } from '../ui/primitives';

/** Typeahead token search with keyboard navigation. Press "/" anywhere to focus. */
export function GlobalSearch({ className }: { className?: string }) {
  const { tokens } = useMarket();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => (query.trim() ? sortTokens(tokens.filter((t) => matchesQuery(t, query)), 'score', 'desc').slice(0, 7) : []), [tokens, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (id: string) => {
    navigate(`/tokens/${id}`);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search tokens"
        placeholder="Search tokens…"
        className="input h-10 pr-10 pl-9"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            if (results[active]) go(results[active].id);
            else if (query.trim()) navigate(`/tokens?q=${encodeURIComponent(query.trim())}`);
          } else if (e.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-subtle lg:block">/</kbd>
      {open && query.trim() && (
        <ul id={listId} role="listbox" className="absolute top-12 right-0 left-0 z-50 animate-fade-in overflow-hidden rounded-xl border border-line-strong bg-surface-2 shadow-2xl">
          {results.length === 0 && <li className="px-4 py-3 text-sm text-muted">No tokens match “{query}”</li>}
          {results.map((t, i) => (
            <li
              key={t.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(t.id);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center gap-3 px-3 py-2.5', i === active && 'bg-surface-3')}
            >
              <TokenAvatar token={t} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">${t.symbol}</p>
                <p className="truncate text-[11px] text-muted">{t.name}</p>
              </div>
              <div className="text-right">
                <p className="num text-xs">{t.marketCap ? formatCompactUsd(t.marketCap) : '—'}</p>
                <ChangeText value={t.priceChange24h} className="text-[11px]" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
