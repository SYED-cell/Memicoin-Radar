import { LogOut, MoreHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMarket } from '../../context/MarketContext';
import { cn } from '../../utils/cn';
import { MOBILE_PRIMARY, NAV_GROUPS } from './navItems';

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
    cn('relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition', active ? 'text-primary' : 'text-muted');

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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Primary">
        <div className="flex">
          {MOBILE_PRIMARY.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => tab(isActive)}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" aria-hidden />}
                  <span className="relative">
                    <item.icon className="size-5" aria-hidden />
                    {item.badge === 'alerts' && unreadCount > 0 && (
                      <span className="num absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen(true)} className={tab(moreActive || moreOpen)} aria-haspopup="dialog" aria-expanded={moreOpen}>
            {moreActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" aria-hidden />}
            <MoreHorizontal className="size-5" aria-hidden />
            More
          </button>
        </div>
      </nav>
    </>
  );
}
