import { Bell, ChevronRight, Database, Globe, LifeBuoy, LogOut, Moon, Palette, Save, Send, Shield, SlidersHorizontal, Sun, TrendingUp, User } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConnectionStatus } from '../components/layout/ConnectionStatus';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Spinner } from '../components/ui/LoadingState';
import { Modal } from '../components/ui/Modal';
import { DemoNotice, PageHeader, Segmented, Toggle } from '../components/ui/primitives';
import { useAuth } from '../context/AuthContext';
import { useMarket } from '../context/MarketContext';
import { useSettings } from '../context/SettingsContext';
import { useTelegram } from '../context/TelegramContext';
import { useToast } from '../context/ToastContext';
import { browserNotificationsSupported, requestBrowserPermission } from '../lib/notify';
import type { AlertThresholds, Language, TradingSettings } from '../types';
import { cn } from '../utils/cn';
import { formatCompactUsd, formatDate, formatPrice, initials } from '../utils/format';
import { playAlertSound } from '../utils/sound';
import { EMAIL_RE } from './AuthPage';

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'es-ES', label: 'Español' },
  { value: 'ja-JP', label: '日本語' },
];

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'alerts', label: 'Alert thresholds', icon: SlidersHorizontal },
  { id: 'trading', label: 'Trading risk', icon: TrendingUp },
  { id: 'telegram', label: 'Telegram', icon: Send },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'data', label: 'Data & connection', icon: Database },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'help', label: 'Help', icon: LifeBuoy },
];

function Card({ id, title, icon: Icon, children, action }: { id: string; title: string; icon: typeof User; children: ReactNode; action?: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-accent/12 text-accent">
          <Icon className="size-4" aria-hidden />
        </span>
        <h2 className="flex-1 font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function NumberField({ id, label, value, onChange, suffix, hint }: { id: string; label: string; value: number; onChange: (v: number) => void; suffix?: string; hint?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          className={cn('input num', suffix && 'pr-10')}
          value={text}
          onChange={(e) => {
            const t = e.target.value.replace(/[^0-9.]/g, '');
            setText(t);
            if (t !== '' && Number.isFinite(Number(t))) onChange(Number(t));
          }}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-subtle">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] text-subtle">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const { user, updateProfile, changePassword, logout, logoutOthers, deleteAccount, sessions } = useAuth();
  const { ui, updateUi, settings, update, saving } = useSettings();
  const { status: tg } = useTelegram();
  const { health } = useMarket();
  const toast = useToast();
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [profileErrors, setProfileErrors] = useState<{ name?: string; email?: string }>({});
  const [profileBusy, setProfileBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [thresholds, setThresholds] = useState<AlertThresholds | null>(null);
  const [trading, setTrading] = useState<TradingSettings | null>(null);

  useEffect(() => {
    if (settings) {
      setThresholds(settings.alerts);
      setTrading(settings.trading);
    }
  }, [settings]);

  if (!user) return null;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof profileErrors = {};
    if (profile.name.trim().length < 2) errs.name = 'Name must be at least 2 characters.';
    if (!EMAIL_RE.test(profile.email.trim())) errs.email = 'Enter a valid email address.';
    setProfileErrors(errs);
    if (Object.keys(errs).length) return;
    setProfileBusy(true);
    try {
      const r = await updateProfile({ name: profile.name.trim(), email: profile.email.trim().toLowerCase() });
      setProfileOpen(false);
      toast.success('Profile updated', r.devLink ? 'Email changed — verify the new address (dev link in the banner).' : undefined);
    } catch (err) {
      setProfileErrors({ email: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      setProfileBusy(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw.current) return setPwError('Enter your current password.');
    if (pw.next.length < 8 || !/[0-9]/.test(pw.next) || !/[a-zA-Z]/.test(pw.next)) return setPwError('New password needs 8+ characters with letters and numbers.');
    if (pw.next !== pw.confirm) return setPwError('New passwords do not match.');
    setPwBusy(true);
    setPwError(null);
    try {
      await changePassword(pw.current, pw.next);
      setPwOpen(false);
      toast.success('Password changed', 'Other devices were signed out.');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setPwBusy(false);
    }
  };

  const saveGroup = async (label: string, patch: Parameters<typeof update>[0]) => {
    try {
      await update(patch);
      toast.success(`${label} saved`);
    } catch (e) {
      toast.error(`Could not save ${label.toLowerCase()}`, e instanceof Error ? e.message : undefined);
    }
  };

  const n = settings?.notifications;
  const permission = browserNotificationsSupported() ? Notification.permission : 'unsupported';

  return (
    <div>
      <PageHeader title="Settings" subtitle="Account, alerts, risk limits and preferences — saved to your account" />
      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden xl:block">
          <ul className="sticky top-24 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                  <s.icon className="size-4" /> {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          <Card id="profile" title="Profile" icon={User}>
            <div className="flex flex-wrap items-center gap-4 py-2">
              <span className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-accent to-primary text-lg font-bold text-white">{initials(user.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{user.name}</p>
                <p className="truncate text-sm text-muted">
                  {user.email} {user.emailVerified ? <span className="chip border-primary/40 text-primary">verified</span> : <span className="chip border-warning/40 text-warning">unverified</span>}
                </p>
                <p className="text-xs text-subtle">Member since {formatDate(user.createdAt, { dateStyle: 'medium' })}</p>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setProfile({ name: user.name, email: user.email });
                  setProfileErrors({});
                  setProfileOpen(true);
                }}
              >
                Edit profile
              </button>
            </div>
          </Card>

          <Card id="notifications" title="Notifications" icon={Bell} action={saving ? <Spinner /> : undefined}>
            {n ? (
              <div className="divide-y divide-line">
                <Toggle label="In-app notifications" description="Toast pop-ups for new alerts" checked={n.inApp} onChange={(v) => void update({ notifications: { inApp: v } })} />
                <Toggle label="Critical alerts" description="Rugs, liquidity pulls, creator dumps" checked={n.critical} onChange={(v) => void update({ notifications: { critical: v } })} />
                <Toggle label="Warning alerts" description="Risk jumps, large sells, volume spikes" checked={n.warning} onChange={(v) => void update({ notifications: { warning: v } })} />
                <Toggle label="Info alerts" description="New qualifying launches, score crossings" checked={n.info} onChange={(v) => void update({ notifications: { info: v } })} />
                <Toggle
                  label="Sound"
                  description="Chime when an alert arrives"
                  checked={n.sound}
                  onChange={(v) => {
                    void update({ notifications: { sound: v } });
                    if (v) playAlertSound();
                  }}
                />
                <Toggle
                  label="Browser notifications"
                  description={permission === 'unsupported' ? 'Not supported in this browser' : permission === 'denied' ? 'Blocked — allow notifications for this site in your browser settings' : 'System notifications while this tab is in the background'}
                  checked={n.browser && permission === 'granted'}
                  disabled={permission === 'unsupported' || permission === 'denied'}
                  onChange={async (v) => {
                    if (v) {
                      const p = await requestBrowserPermission();
                      if (p !== 'granted') {
                        toast.warning('Browser notifications blocked');
                        return;
                      }
                    }
                    void update({ notifications: { browser: v } });
                  }}
                />
              </div>
            ) : (
              <Spinner />
            )}
          </Card>

          <Card id="alerts" title="Alert thresholds" icon={SlidersHorizontal}>
            {thresholds ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveGroup('Alert thresholds', { alerts: thresholds });
                }}
              >
                <div className="divide-y divide-line">
                  <Toggle label="New token alerts" description="Alert when a new launch gets its first full analysis above the minimum score" checked={thresholds.newTokens} onChange={(v) => setThresholds({ ...thresholds, newTokens: v })} />
                  <Toggle label="Creator sell alerts" checked={thresholds.creatorSell} onChange={(v) => setThresholds({ ...thresholds, creatorSell: v })} />
                  <Toggle label="Smart-money / organic buying alerts" checked={thresholds.smartMoney} onChange={(v) => setThresholds({ ...thresholds, smartMoney: v })} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <NumberField id="th-new" label="New token min. opportunity" value={thresholds.newTokenMinScore} onChange={(v) => setThresholds({ ...thresholds, newTokenMinScore: v })} suffix="/100" />
                  <NumberField id="th-score" label="Opportunity crosses" value={thresholds.scoreThreshold} onChange={(v) => setThresholds({ ...thresholds, scoreThreshold: v })} suffix="/100" />
                  <NumberField id="th-risk" label="Risk jump (points)" value={thresholds.riskJump} onChange={(v) => setThresholds({ ...thresholds, riskJump: v })} suffix="pts" />
                  <NumberField id="th-price" label="Price move in 5m" value={thresholds.priceMovePct} onChange={(v) => setThresholds({ ...thresholds, priceMovePct: v })} suffix="%" />
                  <NumberField id="th-liq" label="Liquidity drop" value={thresholds.liquidityDropPct} onChange={(v) => setThresholds({ ...thresholds, liquidityDropPct: v })} suffix="%" />
                  <NumberField id="th-vol" label="Volume spike (× hourly rate)" value={thresholds.volumeSpikeX} onChange={(v) => setThresholds({ ...thresholds, volumeSpikeX: v })} suffix="×" />
                  <NumberField id="th-sell" label="Large holder sell" value={thresholds.largeSellUsd} onChange={(v) => setThresholds({ ...thresholds, largeSellUsd: v })} suffix="USD" hint={`Currently ${formatCompactUsd(thresholds.largeSellUsd)}`} />
                  <NumberField id="th-wmin" label="Watchlist: min opportunity" value={thresholds.watchMinScore} onChange={(v) => setThresholds({ ...thresholds, watchMinScore: v })} suffix="/100" />
                  <NumberField id="th-wmax" label="Watchlist: max risk" value={thresholds.watchMaxRisk} onChange={(v) => setThresholds({ ...thresholds, watchMaxRisk: v })} suffix="/100" />
                </div>
                <p className="mt-3 text-[11px] text-muted">Price, liquidity, sell, volume and risk alerts fire for tokens on your watchlist, tokens you hold, and tokens above your opportunity threshold. Watchlist alerts fire when a watched token enters or exits your conditions.</p>
                <button type="submit" className="btn btn-primary btn-sm mt-3" disabled={saving}>
                  <Save className="size-3.5" /> Save thresholds
                </button>
              </form>
            ) : (
              <Spinner />
            )}
          </Card>

          <Card id="trading" title="Trading risk limits (paper)" icon={TrendingUp}>
            {trading ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveGroup('Trading limits', { trading });
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <NumberField id="tr-risk" label="Risk per trade" value={trading.riskPerTradePct} onChange={(v) => setTrading({ ...trading, riskPerTradePct: v })} suffix="%" />
                  <NumberField id="tr-max" label="Max position size" value={trading.maxPositionPct} onChange={(v) => setTrading({ ...trading, maxPositionPct: v })} suffix="%" hint="Of account equity — enforced by the server" />
                  <NumberField id="tr-sl" label="Default stop-loss" value={trading.defaultStopLossPct} onChange={(v) => setTrading({ ...trading, defaultStopLossPct: v })} suffix="%" />
                  <NumberField id="tr-tp" label="Default take-profit" value={trading.defaultTakeProfitPct} onChange={(v) => setTrading({ ...trading, defaultTakeProfitPct: v })} suffix="%" />
                </div>
                <button type="submit" className="btn btn-primary btn-sm mt-3" disabled={saving}>
                  <Save className="size-3.5" /> Save limits
                </button>
              </form>
            ) : (
              <Spinner />
            )}
          </Card>

          <Link to="/settings/telegram" id="telegram" className="card card-hover flex scroll-mt-24 items-center gap-3 p-4 sm:p-5">
            <span className="grid size-8 place-items-center rounded-lg bg-accent/12 text-accent">
              <Send className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Telegram alerts</p>
              <p className="truncate text-sm text-muted">{!tg ? 'Loading…' : !tg.configured ? 'Bot not configured on this server' : tg.connected ? `Connected as ${tg.username ?? 'your chat'}` : 'Not connected — get alerts on your phone'}</p>
            </div>
            <span className={cn('chip', tg?.connected ? 'border-primary/40 bg-primary/10 text-primary' : 'border-line-strong text-muted')}>{tg?.connected ? 'Connected' : 'Off'}</span>
            <ChevronRight className="size-4 text-muted" />
          </Link>

          <Card id="appearance" title="Appearance & region" icon={Palette}>
            <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Theme</p>
                <p className="text-xs text-muted">Saved on this device</p>
              </div>
              <Segmented
                label="Theme"
                size="sm"
                value={ui.theme}
                onChange={(theme) => updateUi({ theme })}
                options={[
                  { value: 'dark', label: <><Moon className="size-3.5" /> Dark</> },
                  { value: 'light', label: <><Sun className="size-3.5" /> Light</> },
                ]}
              />
            </div>
            <div className="divide-y divide-line border-t border-line">
              <Toggle label="Compact numbers" description={`Show ${formatCompactUsd(1_250_000)} instead of the full amount`} checked={ui.compactNumbers} onChange={(v) => updateUi({ compactNumbers: v })} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label flex items-center gap-1.5" htmlFor="lang">
                  <Globe className="size-3.5" /> Number &amp; date format
                </label>
                <select id="lang" className="input" value={ui.language} onChange={(e) => updateUi({ language: e.target.value as Language })}>
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-line bg-bg-2/60 p-3 text-sm">
                <p className="text-xs text-muted">Preview</p>
                <p className="num">
                  {formatPrice(0.00001234)} · {formatCompactUsd(18_200_000)}
                </p>
                <p className="text-xs text-muted">{formatDate(Date.now(), { dateStyle: 'full' })}</p>
              </div>
            </div>
          </Card>

          <Card id="data" title="Data & connection" icon={Database} action={<ConnectionStatus />}>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between gap-3">
                <span className="text-muted">Launch detection</span>
                <span className="text-right">PumpPortal WebSocket (+ Jupiter recent-tokens polling fallback)</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted">Market data</span>
                <span className="text-right">Jupiter token API (batched, cached, rate-limited)</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted">On-chain reads</span>
                <span className="text-right">Solana RPC · {health?.rpcKind === 'dedicated' ? 'dedicated endpoint with failover' : 'public endpoint (limited)'}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted">Per-trade stream</span>
                <span className="text-right">{health?.tradeStream ? 'Enabled' : 'Disabled — server needs PUMPPORTAL_API_KEY'}</span>
              </li>
            </ul>
            <p className="mt-3 text-[11px] text-subtle">Provider keys are configured on the server only and are never sent to your browser.</p>
          </Card>

          <Card id="security" title="Security" icon={Shield}>
            <div className="divide-y divide-line">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Password</p>
                  <p className="text-xs text-muted">Changing it signs out your other devices</p>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setPw({ current: '', next: '', confirm: '' });
                    setPwError(null);
                    setPwOpen(true);
                  }}
                >
                  Change
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Active sessions</p>
                  <p className="text-xs text-muted">{sessions} signed-in device{sessions === 1 ? '' : 's'} · httpOnly secure cookies</p>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setConfirmOthers(true)} disabled={sessions <= 1}>
                  Sign out others
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-danger">Delete account</p>
                  <p className="text-xs text-muted">Permanently removes your watchlist, alerts, portfolio and Telegram link</p>
                </div>
                <button
                  className="btn btn-outline btn-sm text-danger"
                  onClick={() => {
                    setDeletePw('');
                    setDeleteError(null);
                    setDeleteOpen(true);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </Card>

          <Card id="help" title="Help" icon={LifeBuoy}>
            <ul className="space-y-2 text-sm text-muted">
              <li>
                <span className="font-semibold text-fg">Is the data real?</span> Yes — launches, prices, holders and security checks come from live Solana sources. Scores and scenarios are model outputs.
              </li>
              <li>
                <span className="font-semibold text-fg">Is this financial advice?</span> No. Signals describe data; they never predict prices. Paper trading uses virtual funds only.
              </li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/how-it-works" className="btn btn-outline btn-sm">
                How it works
              </Link>
              <button className="btn btn-outline btn-sm" onClick={() => void logout().then(() => navigate('/login'))}>
                <LogOut className="size-3.5" /> Sign out
              </button>
            </div>
          </Card>
          <DemoNotice>MemeCoin Radar · model-generated analysis of live on-chain data. Not financial advice.</DemoNotice>
        </div>
      </div>

      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Edit profile"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setProfileOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="profile-form" disabled={profileBusy}>
              {profileBusy && <Spinner />} Save
            </button>
          </>
        }
      >
        <form id="profile-form" onSubmit={saveProfile} noValidate className="space-y-4">
          <div>
            <label className="label" htmlFor="pf-name">
              Name
            </label>
            <input id="pf-name" className={cn('input', profileErrors.name && 'input-error')} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} data-autofocus aria-invalid={!!profileErrors.name} />
            {profileErrors.name && (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {profileErrors.name}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="pf-email">
              Email
            </label>
            <input id="pf-email" type="email" className={cn('input', profileErrors.email && 'input-error')} value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} aria-invalid={!!profileErrors.email} />
            {profileErrors.email && (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {profileErrors.email}
              </p>
            )}
            <p className="mt-1 text-[11px] text-subtle">Changing your email requires verifying the new address.</p>
          </div>
        </form>
      </Modal>

      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Change password"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setPwOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="pw-form" disabled={pwBusy}>
              {pwBusy && <Spinner />} Update
            </button>
          </>
        }
      >
        <form id="pw-form" onSubmit={savePassword} noValidate className="space-y-4">
          {(['current', 'next', 'confirm'] as const).map((k) => (
            <div key={k}>
              <label className="label" htmlFor={`pw-${k}`}>
                {k === 'current' ? 'Current password' : k === 'next' ? 'New password' : 'Confirm new password'}
              </label>
              <input id={`pw-${k}`} type="password" autoComplete={k === 'current' ? 'current-password' : 'new-password'} className="input" value={pw[k]} onChange={(e) => setPw((p) => ({ ...p, [k]: e.target.value }))} data-autofocus={k === 'current' ? true : undefined} />
            </div>
          ))}
          {pwError && (
            <p role="alert" className="text-xs text-danger">
              {pwError}
            </p>
          )}
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete account permanently?"
        description="This cannot be undone."
        size="sm"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setDeleteOpen(false)} data-autofocus>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                try {
                  await deleteAccount(deletePw);
                  navigate('/');
                } catch (e) {
                  setDeleteError(e instanceof Error ? e.message : 'Could not delete account');
                }
              }}
            >
              Delete account
            </button>
          </>
        }
      >
        <label className="label" htmlFor="del-pw">
          Confirm with your password
        </label>
        <input id="del-pw" type="password" autoComplete="current-password" className="input" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} />
        {deleteError && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {deleteError}
          </p>
        )}
      </Modal>

      <ConfirmModal
        open={confirmOthers}
        title="Sign out other devices?"
        message="Every other session for this account will be revoked immediately."
        confirmLabel="Sign out others"
        onCancel={() => setConfirmOthers(false)}
        onConfirm={async () => {
          setConfirmOthers(false);
          try {
            await logoutOthers();
            toast.success('Other sessions signed out');
          } catch (e) {
            toast.error('Failed', e instanceof Error ? e.message : undefined);
          }
        }}
      />
    </div>
  );
}
