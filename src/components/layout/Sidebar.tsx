import { LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMarket } from '../../context/MarketContext';
import { useTrading } from '../../context/TradingContext';
import { cn } from '../../utils/cn';
import { formatUsd } from '../../utils/format';
import { ChangeText, Logo } from '../ui/primitives';
import { NAV_GROUPS } from './navItems';

/** Icon rail on tablet (768–1199px), full sidebar on desktop (≥1200px). Hidden on mobile. */
export function Sidebar() {
  const { unreadCount } = useMarket();
  const { summary } = useTrading();
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col border-r border-line bg-bg-2/80 backdrop-blur md:flex xl:w-64" aria-label="Primary">
      <div className="flex h-16 items-center justify-center border-b border-line px-4 xl:justify-start">
        <NavLink to="/dashboard" aria-label="MemeCoin Radar home">
          <span className="xl:hidden"><Logo showText={false} /></span>
          <span className="hidden xl:block"><Logo /></span>
        </NavLink>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 hidden px-3 text-[10px] font-semibold tracking-widest text-subtle uppercase xl:block">{group.title}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    title={item.label}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition xl:justify-start',
                        isActive ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
                        <item.icon className="size-[18px] shrink-0" aria-hidden />
                        <span className="hidden truncate xl:inline">{item.label}</span>
                        {item.badge === 'alerts' && unreadCount > 0 && (
                          <span className="num absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white xl:static xl:ml-auto">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
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
        <button onClick={() => navigate('/portfolio')} className="mb-2 hidden w-full rounded-xl border border-line bg-surface p-3 text-left transition hover:border-line-strong xl:block">
          <p className="text-[11px] text-muted">Paper portfolio</p>
          <p className="num text-base font-bold">{formatUsd(summary.totalValue)}</p>
          <ChangeText value={summary.totalPnlPct} className="text-xs" /> <span className="text-[11px] text-muted">all time</span>
        </button>
        <button
          onClick={() => {
            void logout().then(() => navigate('/login'));
          }}
          className="flex w-full items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-danger/10 hover:text-danger xl:justify-start"
          title="Sign out"
        >
          <LogOut className="size-[18px]" aria-hidden />
          <span className="hidden xl:inline">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
