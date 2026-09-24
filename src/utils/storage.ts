/**
 * Device-local UI preferences only (theme, language, onboarding flag). All account data —
 * sessions, watchlists, alerts, portfolios, Telegram — lives on the server.
 */
const PREFIX = 'mcr:';

export const STORAGE_KEYS = {
  onboarded: 'onboarded',
  settings: 'ui-prefs',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export function load<T>(key: StorageKey, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(key: StorageKey, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — preferences stay in memory */
  }
}
