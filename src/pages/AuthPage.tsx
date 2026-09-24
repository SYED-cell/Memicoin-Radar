import { CheckCircle2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Spinner } from '../components/ui/LoadingState';
import { Modal } from '../components/ui/Modal';
import { Logo } from '../components/ui/primitives';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../lib/api';
import { cn } from '../utils/cn';

type Mode = 'login' | 'signup';
type Field = 'name' | 'email' | 'password' | 'confirm' | 'terms';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(mode: Mode, v: Record<Field, string | boolean>): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  const password = String(v.password);
  const email = String(v.email).trim();
  if (!email) e.email = 'Email is required.';
  else if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email address.';
  if (mode === 'login') {
    if (!password) e.password = 'Password is required.';
    return e;
  }
  const name = String(v.name).trim();
  if (!name) e.name = 'Name is required.';
  else if (name.length < 2) e.name = 'Name must be at least 2 characters.';
  if (!password) e.password = 'Password is required.';
  else if (password.length < 8) e.password = 'Use at least 8 characters.';
  else if (!/[0-9]/.test(password) || !/[a-zA-Z]/.test(password)) e.password = 'Include both letters and numbers.';
  if (v.confirm !== v.password) e.confirm = 'Passwords do not match.';
  if (!v.terms) e.terms = 'Please acknowledge the risk notice.';
  return e;
}

export function passwordStrength(p: string): { score: number; label: string } {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return { score: s, label: ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][s] };
}

export function StrengthMeter({ password }: { password: string }) {
  const strength = passwordStrength(password);
  if (!password) return null;
  return (
    <div aria-live="polite">
      <div className="flex gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', i < strength.score ? (strength.score >= 4 ? 'bg-primary' : strength.score >= 2 ? 'bg-warning' : 'bg-danger') : 'bg-surface-3')} />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">Strength: {strength.label}</p>
    </div>
  );
}

export function FieldWrap({ id, label, icon, error, children, right }: { id: string; label: string; icon: ReactNode; error?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {label}
        </label>
        {right}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle">{icon}</span>
        {children}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-slide-up">
        <Link to="/" className="mb-8 flex justify-center" aria-label="MemeCoin Radar home">
          <Logo />
        </Link>
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const { status, login, signup, requestPasswordReset } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [values, setValues] = useState<Record<Field, string | boolean>>({ name: '', email: '', password: '', confirm: '', terms: false });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverFields, setServerFields] = useState<Partial<Record<Field, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resetError, setResetError] = useState('');
  const [resetDevLink, setResetDevLink] = useState<string | null>(null);

  if (status === 'authenticated' && !pending) return <Navigate to={from} replace />;

  const errors = { ...validate(mode, values), ...serverFields };
  const show = (f: Field) => (submitted || touched[f] ? errors[f] : undefined);
  const set = (f: Field) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [f]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    setServerFields((s) => ({ ...s, [f]: undefined }));
    setFormError(null);
  };
  const blur = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));
  const inputCls = (f: Field) => cn('input pl-10', show(f) && 'input-error');
  const aria = (f: Field) => ({ 'aria-invalid': !!show(f), 'aria-describedby': show(f) ? `${f}-error` : undefined });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(validate(mode, values)).some(Boolean)) return;
    setPending(true);
    setFormError(null);
    try {
      if (mode === 'login') {
        const u = await login(String(values.email).trim(), String(values.password));
        toast.success(`Welcome back, ${u.name.split(' ')[0]}!`);
      } else {
        const u = await signup({ name: String(values.name).trim(), email: String(values.email).trim(), password: String(values.password) });
        toast.success(`Account created — welcome, ${u.name.split(' ')[0]}!`, u.devLink ? 'Development mode: open the verification link from the banner.' : `We sent a verification link to ${u.email}.`);
      }
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields) setServerFields(err.fields as Partial<Record<Field, string>>);
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  };

  const onReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(resetEmail.trim())) {
      setResetState('error');
      setResetError('Enter a valid email address.');
      return;
    }
    setResetState('sending');
    try {
      const r = await requestPasswordReset(resetEmail.trim());
      setResetDevLink(r.devLink ?? null);
      setResetState('sent');
    } catch (err) {
      setResetState('error');
      setResetError(err instanceof Error ? err.message : 'Could not send reset link.');
    }
  };

  return (
    <AuthShell title={mode === 'login' ? 'Welcome Back' : 'Create your account'} subtitle={mode === 'login' ? 'Sign in to your terminal' : 'Real-time Solana launch intelligence. Free to use.'}>
      {formError && (
        <div role="alert" className="mt-5 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {formError}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        {mode === 'signup' && (
          <FieldWrap id="name" label="Full name" icon={<User className="size-4" />} error={show('name')}>
            <input id="name" autoComplete="name" className={inputCls('name')} value={String(values.name)} onChange={set('name')} onBlur={blur('name')} placeholder="Satoshi Nakamoto" {...aria('name')} />
          </FieldWrap>
        )}
        <FieldWrap id="email" label="Email" icon={<Mail className="size-4" />} error={show('email')}>
          <input id="email" type="email" autoComplete="email" className={inputCls('email')} value={String(values.email)} onChange={set('email')} onBlur={blur('email')} placeholder="you@example.com" {...aria('email')} />
        </FieldWrap>
        <FieldWrap
          id="password"
          label="Password"
          icon={<Lock className="size-4" />}
          error={show('password')}
          right={
            mode === 'login' && (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => {
                  setResetOpen(true);
                  setResetState('idle');
                  setResetDevLink(null);
                  setResetEmail(String(values.email));
                }}
              >
                Forgot password?
              </button>
            )
          }
        >
          <input
            id="password"
            type={showPw ? 'text' : 'password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className={cn(inputCls('password'), 'pr-10')}
            value={String(values.password)}
            onChange={set('password')}
            onBlur={blur('password')}
            placeholder="••••••••"
            {...aria('password')}
          />
          <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-subtle hover:text-fg" aria-label={showPw ? 'Hide password' : 'Show password'}>
            {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </FieldWrap>
        {mode === 'signup' && (
          <>
            <StrengthMeter password={String(values.password)} />
            <FieldWrap id="confirm" label="Confirm password" icon={<Lock className="size-4" />} error={show('confirm')}>
              <input id="confirm" type={showPw ? 'text' : 'password'} autoComplete="new-password" className={inputCls('confirm')} value={String(values.confirm)} onChange={set('confirm')} onBlur={blur('confirm')} placeholder="••••••••" {...aria('confirm')} />
            </FieldWrap>
            <div>
              <label className="flex items-start gap-2.5 text-sm text-muted">
                <input type="checkbox" checked={Boolean(values.terms)} onChange={set('terms')} className="mt-0.5 size-4 accent-[var(--color-primary)]" {...aria('terms')} />
                I understand meme coins are extremely risky and that all analysis here is model-generated, not financial advice.
              </label>
              {show('terms') && (
                <p id="terms-error" role="alert" className="mt-1.5 text-xs text-danger">
                  {show('terms')}
                </p>
              )}
            </div>
          </>
        )}

        <button type="submit" className="btn btn-primary w-full py-3" disabled={pending}>
          {pending && <Spinner />}
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {mode === 'login' ? (
          <>
            Don&apos;t have an account?{' '}
            <Link to="/signup" state={location.state} className="font-semibold text-primary hover:underline">
              Sign Up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link to="/login" state={location.state} className="font-semibold text-primary hover:underline">
              Sign In
            </Link>
          </>
        )}
      </p>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset password" description="We'll email you a one-time link valid for 1 hour." size="sm">
        {resetState === 'sent' ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto size-10 text-primary" />
            <p className="text-sm">
              If an account exists for <span className="font-semibold">{resetEmail}</span>, a reset link is on its way.
            </p>
            {resetDevLink && (
              <a href={resetDevLink} className="btn btn-outline w-full">
                Open reset link (dev — no email provider)
              </a>
            )}
            <button className="btn btn-primary w-full" onClick={() => setResetOpen(false)}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onReset} noValidate className="space-y-4">
            <div>
              <label htmlFor="reset-email" className="label">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                className={cn('input', resetState === 'error' && 'input-error')}
                value={resetEmail}
                onChange={(e) => {
                  setResetEmail(e.target.value);
                  setResetState('idle');
                }}
                placeholder="you@example.com"
                data-autofocus
                aria-invalid={resetState === 'error'}
              />
              {resetState === 'error' && (
                <p role="alert" className="mt-1.5 text-xs text-danger">
                  {resetError}
                </p>
              )}
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={resetState === 'sending'}>
              {resetState === 'sending' && <Spinner />} Send reset link
            </button>
          </form>
        )}
      </Modal>
    </AuthShell>
  );
}
