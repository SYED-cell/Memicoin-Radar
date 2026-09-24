import type { Language } from '../types';

let locale: Language = 'en-US';
let compact = true;

export function configureFormatting(next: { locale?: Language; compact?: boolean }) {
  if (next.locale) locale = next.locale;
  if (next.compact !== undefined) compact = next.compact;
}

export function formatUsd(value: number, digits = 2): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Price formatter that keeps meaningful precision for micro-cap token prices. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  let digits = 2;
  if (abs === 0) digits = 2;
  else if (abs < 0.000001) digits = 10;
  else if (abs < 0.0001) digits = 8;
  else if (abs < 0.01) digits = 6;
  else if (abs < 1) digits = 4;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Math.min(digits, 4),
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCompactUsd(value: number): string {
  if (!compact) return formatUsd(value, 0);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: value >= 1e9 ? 2 : 1,
  }).format(value);
}

export function formatNumber(value: number, maxDigits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDigits }).format(value);
}

export function formatCompact(value: number): string {
  if (!compact) return formatNumber(value);
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatQty(value: number): string {
  if (value >= 1000) return formatCompact(value);
  return formatNumber(value, 4);
}

export function formatPercent(value: number, digits = 1, signed = true): string {
  if (!Number.isFinite(value)) return '—';
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}%`;
}

export function formatSignedUsd(value: number): string {
  const s = formatUsd(Math.abs(value));
  return value >= 0 ? `+${s}` : `-${s}`;
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

export function formatAge(createdAt: number, now = Date.now()): string {
  const m = Math.max(1, Math.round((now - createdAt) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function formatTime(ts: number): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ts);
}

export function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(ts);
}

export function formatDate(ts: number, opts: Intl.DateTimeFormatOptions = { dateStyle: 'long' }): string {
  return new Intl.DateTimeFormat(locale, opts).format(ts);
}

export function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 5)}…${addr.slice(-4)}` : addr;
}

export const changeColor = (v: number) => (v > 0 ? 'text-primary' : v < 0 ? 'text-danger' : 'text-muted');

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
