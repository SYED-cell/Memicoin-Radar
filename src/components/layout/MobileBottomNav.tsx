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

  // Icons only, like the reference: the label is the aria-label, so screen readers still get it.
  // touch-manipulation removes the browser's tap delay; the highlight stays ours.
  const tab = (active: boolean) =>
    cn(
      'group relative grid size-12 touch-manipulation select-none place-items-center rounded-2xl outline-none transition-colors duration-200',
      '[-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-white/50',
      active ? 'text-white' : 'text-white/45 hover:text-white/80',
    );

  const renderTab = (item: NavItem) => (
    <NavLink key={item.to} to={item.to} className={({ isActive }) => tab(isActive)} aria-label={item.label} title={item.label}>
      {({ isActive }) => (
        <span className="relative grid place-items-center transition-transform duration-200 group-active:scale-90">
          <item.icon className={cn('size-[22px]', isActive && 'fill-current/20')} aria-hidden />
          {item.badge === 'alerts' && <UnreadBadge />}
          {isActive && <span className="absolute -bottom-2 size-1 rounded-full bg-white" aria-hidden />}
        </span>
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
        A floating pill, inset from the edges and sized to its icons. `contain: layout style`
        isolates it from the streaming feed's work; the wrapper ignores pointer events so its
        padding never swallows taps meant for the page behind it.
      */}
      <nav
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] [contain:layout_style] md:hidden"
        aria-label="Primary"
      >
        {/* An inked bar with one raised light action at its centre, as in the reference: the thing
            you reach for most sits under your thumb and is the only lit surface on the bar. */}
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-ink p-2 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.5)]">
          {MOBILE_LEFT.map(renderTab)}

          <NavLink
            to={MOBILE_CENTER.to}
            aria-label={MOBILE_CENTER.label}
            title={MOBILE_CENTER.label}
            className="group -my-3 grid size-14 touch-manipulation place-items-center rounded-full bg-white text-ink shadow-[0_8px_20px_-6px_rgba(0,0,0,0.6)] outline-none transition [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {({ isActive }) => (
              <span className="grid place-items-center transition-transform duration-200 group-active:scale-90">
                <MOBILE_CENTER.icon className={cn('size-6', isActive && 'fill-current/15')} aria-hidden />
              </span>
            )}
          </NavLink>

          {MOBILE_RIGHT.map(renderTab)}

          <button
            onClick={() => setMoreOpen(true)}
            className={tab(moreActive || moreOpen)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-label="More sections"
            title="More sections"
          >
            <span className="grid place-items-center transition-transform duration-200 group-active:scale-90">
              <MoreHorizontal className="size-[22px]" aria-hidden />
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
