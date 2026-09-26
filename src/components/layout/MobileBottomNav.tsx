import { LogOut, MoreHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMarket } from '../../context/MarketContext';
import { cn } from '../../utils/cn';
import { MOBILE_CENTER, MOBILE_LEFT, MOBILE_PRIMARY, MOBILE_RIGHT, NAV_GROUPS, type NavItem } from './navItems';

/**
 * Unread count lives in its own component so the live feed — which publishes an update every
 * second — re-renders this badge alone instead of the whole tab bar. Without it, taps on the bar
 * compete with a full re-render on every market tick.
 */
function UnreadBadge() {
  const { unreadCount } = useMarket();
  if (unreadCount <= 0) return null;
  return (
    <span className="num absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white tabular-nums">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}

/** Bottom tab bar for phones with a "More" sheet exposing every other route. */
export function MobileBottomNav() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryPaths = MOBILE_PRIMARY.map((i) => i.to);
  const moreActive = !primaryPaths.some((p) => pathname.startsWith(p));

  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  // touch-manipulation removes the browser's tap delay; the transparent highlight keeps the
  // press feedback ours. Sizes step up with the viewport so 320px phones stay uncramped.
  const tab = (active: boolean) =>
    cn(
      'group relative flex flex-1 touch-manipulation select-none flex-col items-center justify-end gap-1 px-0.5 pt-2.5 pb-3 text-[10px] font-medium outline-none',
      'min-w-0 [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset focus-visible:rounded-2xl',
      'min-[380px]:gap-1.5 min-[380px]:px-1 min-[380px]:text-[11px]',
      active ? 'text-fg' : 'text-muted',
    );

  /** Rounded chip behind the icon; it carries the active state and the press feedback. */
  const chip = (active: boolean) =>
    cn(
      'relative grid size-8 place-items-center rounded-xl transition-[background-color,transform,color] duration-200 group-active:scale-90 min-[380px]:size-9',
      active ? 'bg-primary/15 text-primary' : 'text-muted group-hover:bg-surface-2',
    );

  const label = (active: boolean) => cn('max-w-full truncate leading-none transition-colors', active ? 'font-semibold text-fg' : 'text-muted');

  const indicator = <span className="absolute bottom-0.5 h-0.5 w-8 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)] transition-all" aria-hidden />;

  const renderTab = (item: NavItem) => (
    <NavLink key={item.to} to={item.to} className={({ isActive }) => tab(isActive)}>
      {({ isActive }) => (
        <>
          <span className={chip(isActive)}>
            <item.icon className="size-[18px] min-[380px]:size-5" aria-hidden />
            {item.badge === 'alerts' && <UnreadBadge />}
          </span>
          <span className={label(isActive)}>{item.label}</span>
          {isActive && indicator}
        </>
      )}
    </NavLink>
  );

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
          <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={() => setMoreOpen(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] animate-slide-up overflow-y-auto rounded-t-2xl border-t border-line-strong bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">All sections</p>
              <button onClick={() => setMoreOpen(false)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {NAV_GROUPS.map((g) => (
              <div key={g.title} className="mb-3">
                <p className="mb-1.5 text-[10px] font-semibold tracking-widest text-subtle uppercase">{g.title}</p>
                <div className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4">
                  {g.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        cn(
                          'flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center text-[11px] font-medium',
                          isActive ? 'border-primary/40 bg-primary/10 text-primary' : 'border-line bg-bg-2/60 text-muted',
                        )
                      }
                    >
                      <item.icon className="size-5" aria-hidden />
                      <span className="leading-tight">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
            <button
              className="btn btn-outline mt-1 w-full text-danger"
              onClick={() => {
                void logout().then(() => navigate('/login'));
              }}
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>
      )}

      {/*
        `contain: layout style` isolates the bar from the streaming feed's work without paint
        containment, which would clip the raised button. The wrapper ignores pointer events so its
        padding never swallows taps meant for the page behind it.
      */}
      <nav
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] [contain:layout_style] min-[380px]:px-3 md:hidden"
        aria-label="Primary"
      >
        <div className="pointer-events-auto mx-auto flex max-w-md items-end rounded-[24px] border border-line/70 bg-surface/95 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.9)] backdrop-blur-xl min-[380px]:rounded-[26px]">
          {MOBILE_LEFT.map(renderTab)}

          {/* Raised primary action: the live launch feed. */}
          <NavLink to={MOBILE_CENTER.to} className={({ isActive }) => tab(isActive)}>
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute -top-4 grid size-12 place-items-center rounded-full bg-gradient-to-b from-primary to-primary-strong text-black ring-4 ring-bg',
                    'transition-transform duration-200 group-active:scale-90 min-[380px]:-top-5 min-[380px]:size-14',
                    isActive ? 'shadow-[0_0_26px_rgba(34,224,122,0.55)]' : 'shadow-[0_6px_18px_rgba(34,224,122,0.3)]',
                  )}
                  aria-hidden
                >
                  <MOBILE_CENTER.icon className="size-5 min-[380px]:size-6" />
                </span>
                {/* Reserves the icon row so this label lines up with the others. */}
                <span className="size-8 min-[380px]:size-9" aria-hidden />
                <span className={label(isActive)}>{MOBILE_CENTER.label}</span>
                {isActive && indicator}
              </>
            )}
          </NavLink>

          {MOBILE_RIGHT.map(renderTab)}

          <button onClick={() => setMoreOpen(true)} className={tab(moreActive || moreOpen)} aria-haspopup="dialog" aria-expanded={moreOpen}>
            <span className={chip(moreActive || moreOpen)}>
              <MoreHorizontal className="size-[18px] min-[380px]:size-5" aria-hidden />
            </span>
            <span className={label(moreActive || moreOpen)}>More</span>
            {moreActive && indicator}
          </button>
        </div>
      </nav>
    </>
  );
}
