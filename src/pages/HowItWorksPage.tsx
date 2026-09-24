import { ArrowLeftRight, Bell, ChevronLeft, ChevronRight, LineChart, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo, PageHeader, Section } from '../components/ui/primitives';
import { useAuth } from '../context/AuthContext';
import { cn } from '../utils/cn';

const STEPS = [
  {
    icon: Search,
    title: '1. Find',
    text: 'New Solana launches are detected seconds after creation.',
    detail: 'A server-side monitor listens to the PumpPortal launch stream (with a Jupiter polling fallback) and streams every new token to your screen live.',
    to: '/tokens',
    cta: 'Browse tokens',
  },
  {
    icon: LineChart,
    title: '2. Analyze',
    text: 'Market, holder, creator and security data are analysed automatically.',
    detail: 'Each token gets an 8-factor opportunity score, a 13-signal risk score, on-chain security checks and an explanation of exactly why its signal changes.',
    to: '/scoring',
    cta: 'See scoring',
  },
  {
    icon: Bell,
    title: '3. Track',
    text: 'Add to watchlist and get instant alerts.',
    detail: 'Watch tokens and set your own thresholds; alerts arrive in-app, as browser notifications and via the Telegram bot.',
    to: '/watchlist',
    cta: 'Open watchlist',
  },
  {
    icon: ArrowLeftRight,
    title: '4. Trade Simulated',
    text: 'Use paper trading to test your strategy.',
    detail: 'Start with $10,000 of virtual cash, size positions by risk %, set stop-loss/take-profit and track P/L at live prices.',
    to: '/trade',
    cta: 'Start paper trading',
  },
];

export default function HowItWorksPage({ standalone = false }: { standalone?: boolean }) {
  const { user, completeOnboarding } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const finish = () => {
    completeOnboarding();
    navigate(user ? '/dashboard' : '/signup');
  };

  if (standalone) {
    const s = STEPS[step];
    const last = step === STEPS.length - 1;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between">
            <Logo />
            <button className="btn btn-ghost btn-sm" onClick={finish}>Skip</button>
          </div>
          <div className="card p-6 sm:p-8">
            <h1 className="text-xl font-bold">How It Works</h1>
            <div key={step} className="mt-6 animate-slide-up text-center">
              <span className="mx-auto grid size-20 place-items-center rounded-2xl bg-accent/12 text-accent ring-1 ring-accent/30">
                <s.icon className="size-9" aria-hidden />
              </span>
              <h2 className="mt-5 text-lg font-semibold">{s.title}</h2>
              <p className="mt-2 text-muted">{s.text}</p>
              <p className="mt-3 text-sm text-subtle">{s.detail}</p>
            </div>
            <div className="mt-8 flex justify-center gap-2" role="tablist" aria-label="Onboarding steps">
              {STEPS.map((x, i) => (
                <button
                  key={x.title}
                  role="tab"
                  aria-selected={i === step}
                  aria-label={`Step ${i + 1}`}
                  onClick={() => setStep(i)}
                  className={cn('h-2 rounded-full transition-all', i === step ? 'w-6 bg-primary' : 'w-2 bg-surface-3')}
                />
              ))}
            </div>
            <div className="mt-6 flex gap-2">
              <button className="btn btn-outline flex-1" onClick={() => setStep((n) => n - 1)} disabled={step === 0}>
                <ChevronLeft className="size-4" /> Back
              </button>
              {last ? (
                <button className="btn btn-primary flex-1" onClick={finish}>Get Started</button>
              ) : (
                <button className="btn btn-primary flex-1" onClick={() => setStep((n) => n + 1)}>
                  Next <ChevronRight className="size-4" />
                </button>
              )}
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-subtle">
            Already have an account? <Link to="/login" onClick={completeOnboarding} className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="How It Works" subtitle="From discovery to simulated trade in four steps" />
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 2xl:grid-cols-4">
        {STEPS.map((s) => (
          <Section key={s.title} className="flex flex-col">
            <span className="grid size-12 place-items-center rounded-xl bg-accent/12 text-accent ring-1 ring-accent/30">
              <s.icon className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm">{s.text}</p>
            <p className="mt-2 flex-1 text-sm text-muted">{s.detail}</p>
            <Link to={s.to} className="btn btn-outline btn-sm mt-4 self-start">{s.cta} →</Link>
          </Section>
        ))}
      </div>
      <Section title="Good to know">
        <ul className="grid gap-3 text-sm text-muted md:grid-cols-3">
          <li><span className="font-semibold text-fg">Score ≠ safety.</span> Always read the opportunity score together with the risk score.</li>
          <li><span className="font-semibold text-fg">Live data.</span> Launches, prices, holders and security checks come from real Solana sources in real time.</li>
          <li><span className="font-semibold text-fg">Your account.</span> Watchlist, alerts, portfolio and Telegram link are stored securely on the server per account.</li>
        </ul>
      </Section>
      <div className="flex justify-center">
        <button className="btn btn-primary" onClick={() => { completeOnboarding(); navigate('/dashboard'); }}>Get Started</button>
      </div>
    </div>
  );
}
