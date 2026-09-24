import { ArrowLeft, Radar } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Signal, Token } from '../../types';
import { cn } from '../../utils/cn';
import { changeColor, formatPercent, formatTime } from '../../utils/format';

/* ---------- Brand ---------- */

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/30">
        <Radar className="size-5" aria-hidden />
      </span>
      {showText && (
        <span className="leading-none font-extrabold tracking-tight">
          MemeCoin <span className="text-primary">Radar</span>
        </span>
      )}
    </span>
  );
}

/* ---------- Token avatar ---------- */

/** Token image from metadata (IPFS via gateway) with an emoji fallback when missing or broken. */
export function TokenAvatar({ token, size = 'md' }: { token: Pick<Token, 'logo' | 'color' | 'symbol'> & { image?: string }; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const dims = size === 'sm' ? 'size-7 text-sm' : size === 'lg' ? 'size-12 text-2xl' : 'size-9 text-lg';
  return (
    <span
      className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full ring-1 ring-white/10', dims)}
      style={{ background: `radial-gradient(circle at 30% 25%, ${token.color}55, ${token.color}18 70%)` }}
      aria-hidden
    >
      {token.image && !failed ? (
        <img src={token.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <span className="leading-none">{token.logo}</span>
      )}
    </span>
  );
}

/* ---------- Numbers ---------- */

export function ChangeText({ value, className, digits = 1 }: { value: number; className?: string; digits?: number }) {
  return <span className={cn('num font-semibold', changeColor(value), className)}>{formatPercent(value, digits)}</span>;
}

/* ---------- Sparkline ---------- */

export function Sparkline({ data, className, positive }: { data: number[]; className?: string; positive?: boolean }) {
  const id = `spark${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 32;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / range) * (h - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const up = positive ?? data[data.length - 1] >= data[0];
  const color = up ? 'var(--color-primary)' : 'var(--color-danger)';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Gauge ---------- */

export function ScoreGauge({
  value,
  label,
  sublabel,
  tone = 'primary',
  size = 180,
}: {
  value: number;
  label?: string;
  sublabel?: string;
  tone?: 'primary' | 'danger' | 'warning' | 'accent';
  size?: number;
}) {
  const r = 70;
  const circumference = Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const color = `var(--color-${tone})`;
  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: size }} role="img" aria-label={`${label ?? 'Score'} ${value} out of 100`}>
      <svg viewBox="0 0 180 104" className="w-full">
        <path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke="var(--color-surface-3)" strokeWidth={12} strokeLinecap="round" />
        <path
          d="M20 95 A70 70 0 0 1 160 95"
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.8s ease', filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="num text-4xl leading-none font-bold">
          {value}
          <span className="text-base text-muted">/100</span>
        </span>
        {sublabel && <span className="mt-1 text-xs font-semibold" style={{ color }}>{sublabel}</span>}
      </div>
    </div>
  );
}

/* ---------- Controls ---------- */

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({ options, value, onChange, label, size = 'md', className }: SegmentedProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 overflow-x-auto rounded-xl border border-line bg-bg-2/70 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs sm:text-sm',
              active ? 'bg-accent text-white shadow' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn('num rounded-full px-1.5 text-[10px]', active ? 'bg-white/20' : 'bg-surface-3')}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-4 py-2.5', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-primary' : 'bg-surface-3 ring-1 ring-line-strong')}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition', checked && 'translate-x-5')} />
      </button>
    </div>
  );
}

/* ---------- Live status ---------- */

export function LiveIndicator({ live, lastUpdated, className }: { live: boolean; lastUpdated: number | null; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs', className)}>
      <span className={cn('size-2 rounded-full', live ? 'animate-pulse-dot bg-primary' : 'bg-subtle')} aria-hidden />
      <span className={cn('font-semibold', live ? 'text-primary' : 'text-muted')}>{live ? 'Live' : 'Paused'}</span>
      {lastUpdated && <span className="num hidden text-muted sm:inline">· {formatTime(lastUpdated)}</span>}
    </span>
  );
}

/* ---------- Page chrome ---------- */

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: boolean | string; actions?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="mb-4 flex flex-wrap items-center gap-3 sm:mb-6">
      {back && (
        <button
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          className="grid size-9 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-fg"
          aria-label="Go back"
        >
          <ArrowLeft className="size-4" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </header>
  );
}

export function Section({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('card min-w-0 p-4 sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const SIGNAL_TONE: Record<Signal, string> = {
  WATCH: 'text-primary border-primary/40 bg-primary/10',
  'HIGH-RISK SETUP': 'text-warning border-warning/40 bg-warning/10',
  AVOID: 'text-danger border-danger/40 bg-danger/10',
  'INSUFFICIENT DATA': 'text-muted border-line-strong bg-surface-2',
};

const SIGNAL_SHORT: Record<Signal, string> = { WATCH: 'WATCH', 'HIGH-RISK SETUP': 'HIGH-RISK', AVOID: 'AVOID', 'INSUFFICIENT DATA': 'NO DATA' };

/** Descriptive signal label — never a buy/sell recommendation. */
export function SignalBadge({ signal, short = false, className }: { signal: Signal; short?: boolean; className?: string }) {
  return (
    <span className={cn('chip tracking-wide', SIGNAL_TONE[signal], className)} title={signal}>
      {short ? SIGNAL_SHORT[signal] : signal}
    </span>
  );
}

/** Badge shown on anything produced by the demo simulator (DATA_MODE=mock only). */
export function SourceBadge({ source }: { source: Token['source'] }) {
  if (source === 'live') return null;
  return <span className="chip border-warning/40 bg-warning/10 text-warning">DEMO DATA</span>;
}

/** Pulsing "NEW" marker for freshly detected launches. */
export function NewBadge({ detectedAt }: { detectedAt: number }) {
  if (Date.now() - detectedAt > 120_000) return null;
  return <span className="chip animate-pulse border-primary/50 bg-primary/15 text-primary">NEW</span>;
}

export function DemoNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('rounded-lg border border-warning/25 bg-warning/8 px-3 py-2 text-[11px] leading-relaxed text-warning', className)}>{children}</p>
  );
}

export function KeyValue({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-xl border border-line bg-bg-2/60 p-3', className)}>
      <p className="truncate text-[11px] font-medium text-muted">{label}</p>
      <div className="num mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = 'primary' }: { value: number; max?: number; tone?: 'primary' | 'danger' | 'warning' | 'accent' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `var(--color-${tone})` }} />
    </div>
  );
}
