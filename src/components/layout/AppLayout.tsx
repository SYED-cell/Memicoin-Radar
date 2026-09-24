import { MailWarning } from 'lucide-react';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMarket } from '../../context/MarketContext';
import { useToast } from '../../context/ToastContext';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { LoadingState, Spinner } from '../ui/LoadingState';
import { MobileBottomNav } from './MobileBottomNav';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

/** Redirects anonymous visitors to /login, remembering where they were headed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted">
        <span className="flex items-center gap-2">
          <Spinner /> Restoring your session…
        </span>
      </div>
    );
  }
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

function VerifyBanner() {
  const { user, verificationRequired, resendVerification } = useAuth();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  if (!user || user.emailVerified || !verificationRequired) return null;
  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning md:px-6" role="status">
      <div className="mx-auto flex max-w-[2200px] flex-wrap items-center gap-x-3 gap-y-1">
        <MailWarning className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">Verify {user.email} to enable paper trading and Telegram alerts.</span>
        {devLink && (
          <a href={devLink} className="font-semibold underline">
            Open verification link (dev)
          </a>
        )}
        <button
          className="font-semibold underline disabled:opacity-50"
          disabled={sending}
          onClick={async () => {
            setSending(true);
            try {
              const r = await resendVerification();
              if (r.devLink) setDevLink(r.devLink);
              toast.success('Verification email sent', r.devLink ? 'No email provider configured — use the dev link in the banner.' : `Check ${user.email}`);
            } catch (e) {
              toast.error('Could not send email', e instanceof Error ? e.message : undefined);
            } finally {
              setSending(false);
            }
          }}
        >
          {sending ? 'Sending…' : 'Resend email'}
        </button>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { status, error, retry } = useMarket();
  const { pathname } = useLocation();
  return (
    <RequireAuth>
      <div className="flex min-h-dvh">
        <a href="#main" className="sr-only z-[100] rounded-lg bg-accent px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to content
        </a>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Navbar />
          <VerifyBanner />
          {error && status === 'ready' && (
            <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-center text-xs text-danger" role="alert">
              {error} ·{' '}
              <button className="font-semibold underline" onClick={retry}>
                Reconnect now
              </button>
            </div>
          )}
          <main id="main" className="mx-auto w-full max-w-[2200px] min-w-0 flex-1 px-4 pt-4 pb-28 sm:pt-6 md:px-6 md:pb-10 3xl:px-10">
            {status === 'loading' ? (
              error ? (
                <div role="alert" className="card flex flex-col items-center gap-3 p-10 text-center">
                  <p className="font-semibold">Can&apos;t reach the live data server</p>
                  <p className="text-sm text-muted">{error}</p>
                  <button className="btn btn-outline" onClick={retry}>
                    Retry
                  </button>
                </div>
              ) : (
                <LoadingState label="Connecting to the live Solana feed…" />
              )
            ) : (
              <Suspense fallback={<LoadingState label="Loading page…" rows={4} />}>
                <ErrorBoundary resetKey={pathname}>
                  <Outlet />
                </ErrorBoundary>
              </Suspense>
            )}
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </RequireAuth>
  );
}
