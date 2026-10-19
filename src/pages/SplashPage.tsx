import { ArrowRight, Radar } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { get } from '../lib/api';
import { formatNumber } from '../utils/format';

interface Health {
  mode: string;
  stream: string;
  tokens: number;
}

/**
 * The way in. One picture, one sentence, one button — the reference earns attention with the
 * visual and spends words only on what the product does.
 *
 * The cards carry the brand and the live tracked count, never invented coins: this screen is shown
 * signed out, so there is no coin data to show and inventing some would be a lie on the front door.
 */
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
    const id = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const authed = status === 'authenticated';
  const live = health?.stream === 'open';

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden px-6 pt-6 pb-8 sm:px-10">
      {/* Light thrown from behind the cards, as the reference does. */}
      <div
        className="pointer-events-none absolute -top-32 left-1/2 size-[42rem] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgb(34 224 122 / 0.18), transparent 70%)' }}
        aria-hidden
      />

      <header className="relative z-10 flex items-center justify-between">
        <p className="text-lg font-bold tracking-tight">
          Radar<span className="text-primary">.</span>
        </p>
        <Link to={authed ? '/dashboard' : '/login'} className="text-sm font-semibold text-muted transition hover:text-fg">
          {authed ? 'Open terminal' : 'Sign in'}
        </Link>
      </header>

      {/* The hero. On a phone it is the whole middle of the screen; on a desktop it sits beside
          the words rather than being stretched across a width it was never drawn for. */}
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 lg:flex-row lg:items-center lg:gap-16">
        <div className="relative mx-auto h-[16rem] w-full max-w-sm shrink-0 sm:h-[19rem] lg:order-2 lg:max-w-md">
          {/* Insets keep the rotated corners on screen: at -11deg a card pinned to left-0 throws
              its own label past the edge, which reads as a clipping bug rather than a bleed. */}
          <HeroCard
            className="absolute top-1 left-3 w-[76%] -rotate-[11deg]"
            from="#1fb6ff"
            to="#2d6cf6"
            dim
          />
          <HeroCard
            className="absolute top-16 right-2 w-[80%] rotate-[7deg]"
            from="#3df08f"
            to="#17b6a0"
            label={live ? 'Live feed' : 'Connecting'}
            value="pump.fun"
          />
        </div>

        <div className="lg:order-1 lg:flex-1">
          {/* Two lines, like the reference. Each one has to fit a 327px column at this weight,
              which is what decides the wording as much as the size does. */}
          <h1 className="text-[2.4rem] leading-[1.05] font-bold tracking-tight sm:text-5xl xl:text-6xl">
            Catch Launches
            <br />
            Before They Run
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">
            Every Solana launch, priced from the chain and checked fourteen ways.
          </p>

          <button
            onClick={() => navigate(authed ? '/dashboard' : onboarded ? '/signup' : '/onboarding')}
            className="mt-8 flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-6 py-4 text-base font-semibold text-[#101014] transition active:scale-[0.99] lg:max-w-sm"
          >
            {authed ? 'Open the terminal' : 'Get Started'}
            <ArrowRight className="size-5" aria-hidden />
          </button>

          {!authed && (
            <p className="mt-4 text-center text-sm text-muted lg:text-left">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-fg hover:underline">
                Sign in
              </Link>
            </p>
          )}

          <p className="mt-6 flex items-center gap-2 text-xs text-subtle lg:justify-start">
            <span className={live ? 'size-1.5 animate-pulse-dot rounded-full bg-primary' : 'size-1.5 rounded-full bg-subtle'} aria-hidden />
            {health ? `${health.mode === 'live' ? 'Live Solana mainnet' : 'Demo mode'} · ${formatNumber(health.tokens)} coins on the radar` : 'Connecting to the feed…'}
          </p>
        </div>
      </main>

      <p className="relative z-10 mx-auto mt-8 max-w-md text-center text-[11px] leading-relaxed text-subtle">
        Model-generated analysis of live on-chain data. Not financial advice.
      </p>
    </div>
  );
}

/** A gradient card in the reference's shape: a chip, a contactless mark, and one line of truth. */
function HeroCard({
  className,
  from,
  to,
  label,
  value,
  dim,
}: {
  className?: string;
  from: string;
  to: string;
  label?: string;
  value?: string;
  dim?: boolean;
}) {
  return (
    <div
      className={`aspect-[1.6] rounded-[22px] p-4 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.85)] ${dim ? 'opacity-90' : ''} ${className ?? ''}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
      aria-hidden
    >
      <div className="flex h-full flex-col justify-between text-white">
        <div className="flex items-start justify-between">
          {/* The chip and the contactless arcs, drawn rather than imported. */}
          <span className="h-6 w-8 rounded-md border border-white/40 bg-white/25" />
          <span className="flex gap-0.5 opacity-80">
            <span className="h-4 w-1 rounded-full bg-white/70" />
            <span className="h-4 w-1 rounded-full bg-white/50" />
            <span className="h-4 w-1 rounded-full bg-white/30" />
          </span>
        </div>
        {/* The card behind carries no words: half of it is covered, and half a sentence reads as
            a clipping bug rather than depth. */}
        {label && value ? (
          <div>
            <p className="text-[10px] tracking-wide text-white/70 uppercase">{label}</p>
            <p className="truncate text-lg font-bold">{value}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-white/80">
              <Radar className="size-3" /> MemeCoin Radar
            </p>
          </div>
        ) : (
          <span className="h-5 w-10 self-start rounded-full bg-white/20" />
        )}
      </div>
    </div>
  );
}
