import { lazy, Suspense } from 'react';
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

const SplashPage = lazy(() => import('./pages/SplashPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MarketPage = lazy(() => import('./pages/MarketPage'));
const TokenDetailsPage = lazy(() => import('./pages/TokenDetailsPage'));
const ChartsPage = lazy(() => import('./pages/ChartsPage'));
const ScoringPage = lazy(() => import('./pages/ScoringPage'));
const RiskPage = lazy(() => import('./pages/RiskPage'));
const AIAnalysisPage = lazy(() => import('./pages/AIAnalysisPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const AlertDetailsPage = lazy(() => import('./pages/AlertDetailsPage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const PaperTradingPage = lazy(() => import('./pages/PaperTradingPage'));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const TelegramPage = lazy(() => import('./pages/TelegramPage'));
const DailyReportPage = lazy(() => import('./pages/DailyReportPage'));
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

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
