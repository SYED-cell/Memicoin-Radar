import { riskLevel } from '../../shared/riskEngine.ts';
import type { RiskLevel, Signal, Token } from '../types';

export type MarketTab = 'all' | 'new' | 'trending' | 'gainers' | 'losers';
export type SortKey = 'detectedAt' | 'score' | 'riskScore' | 'price' | 'priceChange5m' | 'priceChange1h' | 'volume5m' | 'volume24h' | 'liquidity' | 'marketCap' | 'holders' | 'createdAt';
export type SortDir = 'asc' | 'desc';

export interface TokenFilters {
  query: string;
  tab: MarketTab;
  signal: Signal | 'all';
  risk: RiskLevel | 'all';
  minScore: number;
  minLiquidity: number;
  sort: SortKey;
  dir: SortDir;
}

export const DEFAULT_FILTERS: TokenFilters = {
  query: '',
  tab: 'all',
  signal: 'all',
  risk: 'all',
  minScore: 0,
  minLiquidity: 0,
  sort: 'detectedAt',
  dir: 'desc',
};

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'detectedAt', label: 'Newest' },
  { value: 'score', label: 'Opportunity' },
  { value: 'riskScore', label: 'Risk' },
  { value: 'priceChange5m', label: '5m change' },
  { value: 'priceChange1h', label: '1h change' },
  { value: 'volume5m', label: '5m volume' },
  { value: 'volume24h', label: '24h volume' },
  { value: 'liquidity', label: 'Liquidity' },
  { value: 'marketCap', label: 'Market cap' },
  { value: 'holders', label: 'Holders' },
  { value: 'price', label: 'Price' },
];

const MIN = 60_000;
export const NEW_WINDOW_MS = 10 * MIN;

export const isNew = (t: Token, now = Date.now()) => now - t.detectedAt < NEW_WINDOW_MS;
/** Volume accelerating and buyers in control. */
export const isTrending = (t: Token) => t.volume1h > 0 && (t.volume5m * 12) / t.volume1h >= 1.3 && t.buyVolume >= t.sellVolume;

export function matchesQuery(t: Token, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^\$/, '');
  if (!q) return true;
  return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.mint.toLowerCase() === q || (t.creator?.toLowerCase() === q) || t.narrative.toLowerCase().includes(q);
}

const val = (t: Token, k: SortKey) => (t[k] ?? -Infinity) as number;

export function sortTokens(tokens: Token[], key: SortKey, dir: SortDir): Token[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...tokens].sort((a, b) => (val(a, key) - val(b, key)) * m || b.detectedAt - a.detectedAt);
}

export function applyFilters(tokens: Token[], f: TokenFilters, now = Date.now()): Token[] {
  const filtered = tokens.filter((t) => {
    if (!matchesQuery(t, f.query)) return false;
    if (f.signal !== 'all' && t.signal !== f.signal) return false;
    if (f.risk !== 'all' && (t.signal === 'INSUFFICIENT DATA' || riskLevel(t.riskScore) !== f.risk)) return false;
    if (t.score < f.minScore) return false;
    if (t.liquidity < f.minLiquidity) return false;
    switch (f.tab) {
      case 'new':
        return isNew(t, now);
      case 'trending':
        return isTrending(t);
      case 'gainers':
        return (t.priceChange1h ?? t.priceChange24h) > 0;
      case 'losers':
        return (t.priceChange1h ?? t.priceChange24h) < 0;
      default:
        return true;
    }
  });
  return sortTokens(filtered, f.sort, f.dir);
}

export function topBy(tokens: Token[], key: SortKey, n: number, dir: SortDir = 'desc'): Token[] {
  return sortTokens(tokens, key, dir).slice(0, n);
}
