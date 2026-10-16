import { ChevronLeft, ChevronRight, LogOut, Radar } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMarket } from '../../context/MarketContext';
import { useTrading } from '../../context/TradingContext';
import { cn } from '../../utils/cn';
import { formatUsd } from '../../utils/format';
import { ChangeText } from '../ui/primitives';
import { NAV_GROUPS } from './navItems';

const KEY = 'mcr.sidebar.collapsed';

/**
 * The desktop rail: who you are and where you are, in that order. It collapses to icons on
 * request and does so by itself below 1200px, where the labels stop fitting.
 */
export function Sidebar() {
  const { unreadCount } = useMarket();
  const { summary } = useTrading();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(KEY) === '1');

  useEffect(() => {
    try {
      localStorage.setItem(KEY, collapsed ? '1' : '0');
    } catch {
      /* private mode: the preference simply does not persist */
    }
  }, [collapsed]);

  // `wide` is the class gate for everything that only exists when labels do.
  const wide = collapsed ? 'hidden' : 'hidden xl:block';
  const first = user?.name.split(' ')[0] ?? 'trader';

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-bg-2/80 backdrop-blur md:flex',
        collapsed ? 'w-[76px]' : 'w-[76px] xl:w-[272px]',
      )}
      aria-label="Primary"
    >
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <NavLink to="/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label="MemeCoin Radar home">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/30">
            <Radar className="size-5" aria-hidden />
          </span>
          <span className={cn('min-w-0', wide)}>
            <span className="block truncate leading-tight font-extrabold tracking-tight">MemeCoin Radar</span>
            <span className="block truncate text-[11px] text-muted">Live Solana intelligence</span>
          </span>
        </NavLink>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            'ml-auto hidden size-8 shrink-0 place-items-center rounded-full border border-line text-muted transition hover:text-fg xl:grid',
            collapsed && 'ml-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>

      <div className={cn('border-y border-line px-4 py-5', wide)}>
        <p className="text-2xl leading-tight font-semibold tracking-tight">
          Welcome
          <br />
          back, {first}
        </p>
        {/* The reference prints a last-login date; we do not record one, so this says what we do
            know rather than inventing a timestamp. */}
        {user?.createdAt ? <p className="mt-2 text-xs text-muted">Member since {new Date(user.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p> : null}
      </div>

      <nav className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className={cn('mb-1.5 px-3 text-[11px] font-medium text-subtle', wide)}>{group.title}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    title={item.label}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center justify-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition',
                        collapsed ? '' : 'xl:justify-start',
                        isActive
                          ? 'border border-line-strong bg-surface text-fg shadow-(--shadow-card)'
                          : 'border border-transparent text-muted hover:bg-surface-2/70 hover:text-fg',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className="size-[18px] shrink-0" aria-hidden />
                        <span className={cn('truncate', collapsed ? 'hidden' : 'hidden xl:inline')}>{item.label}</span>
                        {item.badge === 'alerts' && unreadCount > 0 && (
                          <span
                            className={cn(
                              'num grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white',
                              collapsed ? 'absolute top-1 right-1' : 'absolute top-1 right-1 xl:static xl:ml-auto',
                            )}
                          >
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                        {/* The active marker sits on the rail's inner edge, as in the reference. */}
                        {isActive && <span className={cn('absolute top-3 right-0 bottom-3 w-0.5 rounded-full bg-primary', collapsed ? 'hidden' : 'hidden xl:block')} aria-hidden />}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <button
          onClick={() => navigate('/portfolio')}
          className={cn('mb-2 w-full rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-line-strong', wide)}
        >
          <p className="text-[11px] text-muted">Paper portfolio</p>
          <p className="num text-base font-bold">{formatUsd(summary.totalValue)}</p>
          <ChangeText value={summary.totalPnlPct} className="text-xs" /> <span className="text-[11px] text-muted">all time</span>
        </button>
        <button
          onClick={() => {
            void logout().then(() => navigate('/login'));
          }}
          className={cn(
            'flex w-full items-center justify-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-danger/10 hover:text-danger',
            collapsed ? '' : 'xl:justify-start',
          )}
          title="Sign out"
        >
          <LogOut className="size-[18px]" aria-hidden />
          <span className={cn(collapsed ? 'hidden' : 'hidden xl:inline')}>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
