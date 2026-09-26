import { LogOut, MoreHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMarket } from '../../context/MarketContext';
import { cn } from '../../utils/cn';
import { MOBILE_CENTER, MOBILE_LEFT, MOBILE_PRIMARY, MOBILE_RIGHT, NAV_GROUPS, type NavItem } from './navItems';

/** Bottom tab bar for phones with a "More" sheet exposing every other route. */
export function MobileBottomNav() {
  const { unreadCount } = useMarket();
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

  const tab = (active: boolean) =>
    cn('relative flex flex-1 flex-col items-center justify-end gap-1.5 px-1 pt-3 pb-3.5 text-[10px] font-medium transition', active ? 'text-fg' : 'text-muted');

  /** Green pill under the active tab, matching the bar's rounded bottom edge. */
  const indicator = <span className="absolute bottom-1 h-1 w-9 rounded-full bg-primary shadow-[0_0_10px_var(--color-primary)]" aria-hidden />;

  const alertBadge = (item: NavItem) =>
    item.badge === 'alerts' && unreadCount > 0 ? (
      <span className="num absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    ) : null;

  const renderTab = (item: NavItem) => (
    <NavLink key={item.to} to={item.to} className={({ isActive }) => tab(isActive)}>
      {({ isActive }) => (
        <>
          <span className="relative">
            <item.icon className="size-5" aria-hidden />
            {alertBadge(item)}
          </span>
          <span className={cn('leading-none', isActive && 'font-semibold')}>{item.label}</span>
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

      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.65rem+env(safe-area-inset-bottom))] md:hidden" aria-label="Primary">
        <div className="mx-auto flex max-w-md items-end rounded-[26px] border border-line/70 bg-surface/92 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          {MOBILE_LEFT.map(renderTab)}

          {/* Raised primary action: the live launch feed. */}
          <NavLink to={MOBILE_CENTER.to} className={({ isActive }) => tab(isActive)}>
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute -top-5 grid size-14 place-items-center rounded-full ring-4 ring-bg transition',
                    isActive ? 'bg-primary shadow-[0_0_26px_rgba(34,224,122,0.55)]' : 'bg-primary/90 shadow-[0_0_18px_rgba(34,224,122,0.35)]',
                  )}
                  aria-hidden
                >
                  <MOBILE_CENTER.icon className="size-6 text-black" />
                </span>
                <span className="size-5" aria-hidden />
                <span className={cn('leading-none', isActive && 'font-semibold')}>{MOBILE_CENTER.label}</span>
                {isActive && indicator}
              </>
            )}
          </NavLink>

          {MOBILE_RIGHT.map(renderTab)}

          <button onClick={() => setMoreOpen(true)} className={tab(moreActive || moreOpen)} aria-haspopup="dialog" aria-expanded={moreOpen}>
            <MoreHorizontal className="size-5" aria-hidden />
            <span className={cn('leading-none', (moreActive || moreOpen) && 'font-semibold')}>More</span>
            {moreActive && indicator}
          </button>
        </div>
      </nav>
    </>
  );
}
