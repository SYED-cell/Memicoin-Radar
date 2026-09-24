import { Activity, Bell, Bot, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/ui/primitives';
import { useAuth } from '../context/AuthContext';
import { get } from '../lib/api';
import { formatNumber } from '../utils/format';

const FEATURES = [
  { icon: Activity, title: 'Real-time launch detection', text: 'New Solana tokens stream in seconds after creation' },
  { icon: ShieldCheck, title: 'Rug & manipulation checks', text: '13-signal risk engine: authorities, holders, creator, flow' },
  { icon: Bot, title: 'Explainable analysis', text: 'Every score shows exactly which metrics moved it' },
  { icon: Bell, title: 'Alerts everywhere', text: 'In-app, browser and Telegram — your thresholds' },
];

interface Health {
  mode: string;
  stream: string;
  tokens: number;
}

export default function SplashPage() {
  const { status, onboarded } = useAuth();
  const navigate = useNavigate();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      get<Health>('/api/health')
        .then((h) => !cancelled && setHealth(h))
        .catch(() => !cancelled && setHealth(null));
    void load();
    const id = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const authed = status === 'authenticated';
  const getStarted = () => navigate(authed ? '/dashboard' : onboarded ? '/signup' : '/onboarding');

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <Link to={authed ? '/dashboard' : '/login'} className="btn btn-ghost">
          {authed ? 'Open terminal' : 'Sign in'}
        </Link>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 pb-12 lg:grid-cols-2">
        <div className="animate-slide-up text-center lg:text-left">
          <span className="chip mb-5 border-primary/40 bg-primary/10 text-primary">
            <span className={health?.stream === 'open' ? 'size-1.5 animate-pulse-dot rounded-full bg-primary' : 'size-1.5 rounded-full bg-subtle'} />
            {health ? `${health.mode === 'live' ? 'Live Solana mainnet' : 'Demo mode'} · ${formatNumber(health.tokens)} tokens tracked` : 'Connecting…'}
          </span>
          <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl xl:text-6xl">
            MEMECOIN
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">RADAR</span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-lg text-muted lg:mx-0">
            Find early launches. Spot scams. <span className="text-fg">Decide with data.</span>
          </p>
          <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 lg:mx-0">
            <button onClick={getStarted} className="btn btn-primary py-3.5 text-base">
              {authed ? 'Go to Dashboard' : 'Get Started'}
            </button>
            {!authed && (
              <Link to="/login" className="btn btn-outline py-3.5 text-base">
                Sign In
              </Link>
            )}
          </div>
          <p className="mt-6 text-xs text-subtle">Real-time data · Explainable scoring · Paper trading</p>
        </div>

        <div className="relative animate-fade-in">
          <div className="card relative mx-auto max-w-md p-5">
            <ul className="space-y-4">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{f.title}</p>
                    <p className="text-xs text-muted">{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-center text-[11px] text-subtle">Scores are model-generated from live on-chain and market data. Nothing here is financial advice.</p>
        </div>
      </main>
    </div>
  );
}
