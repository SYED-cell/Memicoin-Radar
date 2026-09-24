import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, get, post, patch as apiPatch, setUnauthorizedHandler } from '../lib/api';
import type { User } from '../types';
import { usePersistentState } from '../hooks/usePersistentState';
import { STORAGE_KEYS } from '../utils/storage';

type Status = 'loading' | 'authenticated' | 'anonymous';

/** Returned by email-sending endpoints in development when no email provider is configured. */
export interface DevLinkResult {
  devLink?: string;
}

interface AuthApi {
  status: Status;
  user: User | null;
  verificationRequired: boolean;
  sessions: number;
  onboarded: boolean;
  completeOnboarding: () => void;
  login: (email: string, password: string) => Promise<User>;
  signup: (input: { name: string; email: string; password: string }) => Promise<User & DevLinkResult>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  verifyEmail: (token: string) => Promise<User>;
  resendVerification: () => Promise<DevLinkResult>;
  requestPasswordReset: (email: string) => Promise<DevLinkResult>;
  resetPassword: (token: string, password: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  updateProfile: (patch: { name: string; email: string }) => Promise<DevLinkResult>;
  logoutOthers: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

interface MeResponse {
  user: User;
  verificationRequired: boolean;
  sessions: number;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(true);
  const [sessions, setSessions] = useState(0);
  const [onboarded, setOnboarded] = usePersistentState<boolean>(STORAGE_KEYS.onboarded, false);

  const reload = useCallback(async () => {
    try {
      const me = await get<MeResponse>('/api/auth/me');
      setUser(me.user);
      setVerificationRequired(me.verificationRequired);
      setSessions(me.sessions);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    void reload();
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('anonymous');
    });
  }, [reload]);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await post<{ user: User }>('/api/auth/login', { email, password });
      await reload();
      return r.user;
    },
    [reload],
  );

  const signup = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      const r = await post<{ user: User; devLink?: string }>('/api/auth/signup', input);
      await reload();
      return { ...r.user, devLink: r.devLink };
    },
    [reload],
  );

  const logout = useCallback(async () => {
    await post('/api/auth/logout').catch(() => undefined);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const verifyEmail = useCallback(
    async (token: string) => {
      const r = await post<{ user: User }>('/api/auth/verify-email', { token });
      if (user) setUser(r.user);
      return r.user;
    },
    [user],
  );

  const value = useMemo<AuthApi>(
    () => ({
      status,
      user,
      verificationRequired,
      sessions,
      onboarded,
      completeOnboarding: () => setOnboarded(true),
      login,
      signup,
      logout,
      reload,
      verifyEmail,
      resendVerification: () => post<DevLinkResult>('/api/auth/resend-verification'),
      requestPasswordReset: (email) => post<DevLinkResult>('/api/auth/forgot-password', { email }),
      resetPassword: async (token, password) => {
        await post('/api/auth/reset-password', { token, password });
      },
      changePassword: async (current, next) => {
        await post('/api/auth/change-password', { current, next });
      },
      updateProfile: async (p) => {
        const r = await apiPatch<{ user: User; devLink?: string }>('/api/auth/profile', p);
        setUser(r.user);
        return { devLink: r.devLink };
      },
      logoutOthers: async () => {
        await post('/api/auth/logout-others');
        await reload();
      },
      deleteAccount: async (password) => {
        await api('/api/auth/account', { method: 'DELETE', body: { password } });
        setUser(null);
        setStatus('anonymous');
      },
    }),
    [status, user, verificationRequired, sessions, onboarded, setOnboarded, login, signup, logout, reload, verifyEmail],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
