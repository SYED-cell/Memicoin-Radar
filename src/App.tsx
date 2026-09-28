import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout, ScrollToTop } from './components/layout/AppLayout';
import { LoadingState } from './components/ui/LoadingState';
import { AuthProvider } from './context/AuthContext';
import { MarketProvider } from './context/MarketContext';
import { SettingsProvider } from './context/SettingsContext';
import { TelegramProvider } from './context/TelegramContext';
import { ToastProvider } from './context/ToastContext';
import { TradingProvider } from './context/TradingContext';
import { WatchlistProvider } from './context/WatchlistContext';

/**
 * A deploy replaces the hashed chunks, so a page left open asks for files that no longer exist.
 * Reload once to pick up the new build instead of crashing the view.
 */
const lazyPage = <P,>(load: () => Promise<{ default: ComponentType<P> }>) =>
  lazy(() =>
    load().catch((err: unknown) => {
      const last = Number(sessionStorage.getItem('chunk-reload') ?? 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem('chunk-reload', String(Date.now()));
        window.location.reload();
      }
      throw err;
    }),
  );

const SplashPage = lazyPage(() => import('./pages/SplashPage'));
const AuthPage = lazyPage(() => import('./pages/AuthPage'));
const VerifyEmailPage = lazyPage(() => import('./pages/VerifyEmailPage'));
const ResetPasswordPage = lazyPage(() => import('./pages/ResetPasswordPage'));
const DashboardPage = lazyPage(() => import('./pages/DashboardPage'));
const MarketPage = lazyPage(() => import('./pages/MarketPage'));
const TokenDetailsPage = lazyPage(() => import('./pages/TokenDetailsPage'));
const ChartsPage = lazyPage(() => import('./pages/ChartsPage'));
const ScoringPage = lazyPage(() => import('./pages/ScoringPage'));
const RiskPage = lazyPage(() => import('./pages/RiskPage'));
const AIAnalysisPage = lazyPage(() => import('./pages/AIAnalysisPage'));
const AlertsPage = lazyPage(() => import('./pages/AlertsPage'));
const AlertDetailsPage = lazyPage(() => import('./pages/AlertDetailsPage'));
const WatchlistPage = lazyPage(() => import('./pages/WatchlistPage'));
const PaperTradingPage = lazyPage(() => import('./pages/PaperTradingPage'));
const PortfolioPage = lazyPage(() => import('./pages/PortfolioPage'));
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'));
const TelegramPage = lazyPage(() => import('./pages/TelegramPage'));
const DailyReportPage = lazyPage(() => import('./pages/DailyReportPage'));
const HowItWorksPage = lazyPage(() => import('./pages/HowItWorksPage'));
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage'));

function PageFallback() {
  return (
    <div className="p-4 md:p-6">
      <LoadingState label="Loading page…" rows={4} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SettingsProvider>
            <MarketProvider>
              <WatchlistProvider>
                <TradingProvider>
                  <TelegramProvider>
                    <ScrollToTop />
                    <Suspense fallback={<PageFallback />}>
                      <Routes>
                        <Route path="/" element={<SplashPage />} />
                        <Route path="/login" element={<AuthPage mode="login" />} />
                        <Route path="/signup" element={<AuthPage mode="signup" />} />
                        <Route path="/verify-email" element={<VerifyEmailPage />} />
                        <Route path="/reset-password" element={<ResetPasswordPage />} />
                        <Route path="/onboarding" element={<HowItWorksPage standalone />} />
                        <Route element={<AppLayout />}>
                          <Route path="/dashboard" element={<DashboardPage />} />
                          <Route path="/tokens" element={<MarketPage />} />
                          <Route path="/tokens/:id" element={<TokenDetailsPage />} />
                          <Route path="/charts/:id?" element={<ChartsPage />} />
                          <Route path="/scoring/:id?" element={<ScoringPage />} />
                          <Route path="/risk/:id?" element={<RiskPage />} />
                          <Route path="/ai/:id?" element={<AIAnalysisPage />} />
                          <Route path="/alerts" element={<AlertsPage />} />
                          <Route path="/alerts/:id" element={<AlertDetailsPage />} />
                          <Route path="/watchlist" element={<WatchlistPage />} />
                          <Route path="/trade" element={<PaperTradingPage />} />
                          <Route path="/portfolio" element={<PortfolioPage />} />
                          <Route path="/settings" element={<SettingsPage />} />
                          <Route path="/settings/telegram" element={<TelegramPage />} />
                          <Route path="/report" element={<DailyReportPage />} />
                          <Route path="/how-it-works" element={<HowItWorksPage />} />
                          <Route path="*" element={<NotFoundPage />} />
                        </Route>
                      </Routes>
                    </Suspense>
                  </TelegramProvider>
                </TradingProvider>
              </WatchlistProvider>
            </MarketProvider>
          </SettingsProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
