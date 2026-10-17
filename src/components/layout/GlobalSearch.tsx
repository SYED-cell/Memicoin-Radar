import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarket } from '../../context/MarketContext';
import { matchesQuery, sortTokens } from '../../services/tokenFilters';
import type { Token } from '../../types';
import { cn } from '../../utils/cn';
import { formatCompactUsd } from '../../utils/format';
import { ChangeText, TokenAvatar } from '../ui/primitives';
import { NAV_GROUPS } from './navItems';

/** Every page is reachable by name, so the search box is also the way around the app. */
const PAGES = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ to: i.to, label: i.label, group: g.title, icon: i.icon })));

type Row = { kind: 'token'; token: Token } | { kind: 'page'; to: string; label: string; group: string; icon: (typeof PAGES)[number]['icon'] };

/**
 * Typeahead over the live coins and over the app's own pages — type "alerts" and go there, type a
 * symbol and open the coin. Press "/" or ⌘K anywhere to focus it.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const { tokens } = useMarket();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const rows = useMemo<Row[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const needle = q.toLowerCase();
    const pages: Row[] = PAGES.filter((p) => p.label.toLowerCase().includes(needle) || p.group.toLowerCase().includes(needle))
      .slice(0, 3)
      .map((p) => ({ kind: 'page', ...p }));
    const coins: Row[] = sortTokens(tokens.filter((t) => matchesQuery(t, q)), 'score', 'desc')
      .slice(0, 7 - pages.length)
      .map((token) => ({ kind: 'token', token }));
    // Pages first: an exact page name is an unambiguous intent, a coin match rarely is.
    return [...pages, ...coins];
  }, [tokens, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      // ⌘K / Ctrl-K is the shortcut people try first; "/" stays for anyone used to it.
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (row: Row) => {
    navigate(row.kind === 'token' ? `/tokens/${row.token.id}` : row.to);
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
        aria-expanded={open && rows.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search coins and pages"
        placeholder="Search coins or pages…"
        className="input h-10 pr-12 pl-9"
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
            setActive((a) => Math.min(a + 1, rows.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            if (rows[active]) go(rows[active]);
            else if (query.trim()) navigate(`/tokens?q=${encodeURIComponent(query.trim())}`);
          } else if (e.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-subtle lg:block">⌘K</kbd>

      {open && query.trim() && (
        <ul id={listId} role="listbox" className="absolute top-12 right-0 left-0 z-50 animate-fade-in overflow-hidden rounded-2xl border border-line-strong bg-surface-2 shadow-2xl">
          {rows.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nothing matches “{query}”</li>}
          {rows.map((row, i) => (
            <li
              key={row.kind === 'token' ? row.token.id : row.to}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(row);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center gap-3 px-3 py-2.5', i === active && 'bg-surface-3')}
            >
              {row.kind === 'page' ? (
                <>
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted">
                    <row.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{row.label}</span>
                    <span className="block truncate text-[11px] text-muted">{row.group}</span>
                  </span>
                  {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-subtle" aria-hidden />}
                </>
              ) : (
                <>
                  <TokenAvatar token={row.token} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">${row.token.symbol}</span>
                    <span className="block truncate text-[11px] text-muted">{row.token.name}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-xs">{row.token.marketCap ? formatCompactUsd(row.token.marketCap) : '—'}</span>
                    <ChangeText value={row.token.priceChange24h} className="text-[11px]" />
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
