import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, put } from '../lib/api';
import type { UiPrefs, UserSettings } from '../types';
import { usePersistentState } from '../hooks/usePersistentState';
import { configureFormatting } from '../utils/format';
import { STORAGE_KEYS } from '../utils/storage';
import { useAuth } from './AuthContext';

export const DEFAULT_UI: UiPrefs = { theme: 'dark', language: 'en-US', compactNumbers: true };

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

interface SettingsApi {
  ui: UiPrefs;
  updateUi: (patch: Partial<UiPrefs>) => void;
  /** Server-side per-user settings (null until loaded / signed out). */
  settings: UserSettings | null;
  saving: boolean;
  update: (patch: DeepPartial<UserSettings>) => Promise<UserSettings>;
}

const SettingsContext = createContext<SettingsApi | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [storedUi, setUi] = usePersistentState<UiPrefs>(STORAGE_KEYS.settings, DEFAULT_UI);
  const ui = useMemo(() => ({ ...DEFAULT_UI, ...storedUi }), [storedUi]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);

  configureFormatting({ locale: ui.language, compact: ui.compactNumbers });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = ui.theme;
    root.lang = ui.language;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ui.theme === 'dark' ? '#050a16' : '#eef2f8');
  }, [ui.theme, ui.language]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setSettings(null);
      return;
    }
    let cancelled = false;
    get<{ settings: UserSettings }>('/api/settings')
      .then((r) => !cancelled && setSettings(r.settings))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status]);

  const updateUi = useCallback((p: Partial<UiPrefs>) => setUi((s) => ({ ...s, ...p })), [setUi]);

  const update = useCallback(
    async (patch: DeepPartial<UserSettings>) => {
      // Optimistic update, reconciled with the server's sanitised copy.
      setSettings((s) =>
        s
          ? {
              notifications: { ...s.notifications, ...patch.notifications },
              alerts: { ...s.alerts, ...patch.alerts },
              trading: { ...s.trading, ...patch.trading },
              telegram: { ...s.telegram, ...patch.telegram },
            }
          : s,
      );
      setSaving(true);
      try {
        const r = await put<{ settings: UserSettings }>('/api/settings', patch);
        setSettings(r.settings);
        return r.settings;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const value = useMemo(() => ({ ui, updateUi, settings, saving, update }), [ui, updateUi, settings, saving, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
