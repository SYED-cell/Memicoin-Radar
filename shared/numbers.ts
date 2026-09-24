/** Locale-independent formatting used by server-side messages (Telegram, reports) and shared engines. */
export function compactUsd(v: number): string {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : a.toFixed(a >= 1 ? 0 : 2);
  return `${v < 0 ? '-' : ''}$${s}`;
}

export function priceUsd(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '$0';
  if (v >= 1) return `$${v.toFixed(2)}`;
  const digits = Math.min(12, Math.max(4, Math.ceil(-Math.log10(v)) + 3));
  return `$${v.toFixed(digits)}`;
}

export function signedPct(v: number, digits = 0): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export function age(createdAt: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - createdAt) / 1000));
  if (s < 90) return `${s} sec`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
