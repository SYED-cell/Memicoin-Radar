import { Bell, ChevronDown, LogOut, Search, Settings, User as UserIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMarket } from '../../context/MarketContext';
import { cn } from '../../utils/cn';
import { initials } from '../../utils/format';
import { Logo } from '../ui/primitives';
import { ConnectionDot, ConnectionStatus } from './ConnectionStatus';
import { GlobalSearch } from './GlobalSearch';

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-3 hover:text-fg';
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 hover:bg-surface-2" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-accent to-primary text-xs font-bold text-white">{initials(user.name)}</span>
        <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 animate-fade-in rounded-xl border border-line-strong bg-surface-2 p-1.5 shadow-2xl">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="py-1">
            <button role="menuitem" className={item} onClick={() => { setOpen(false); navigate('/settings'); }}>
              <UserIcon className="size-4" /> Profile
            </button>
            <button role="menuitem" className={item} onClick={() => { setOpen(false); navigate('/settings'); }}>
              <Settings className="size-4" /> Settings
            </button>
            <button
              role="menuitem"
              className={cn(item, 'hover:bg-danger/10 hover:text-danger')}
              onClick={() => {
                void logout().then(() => navigate('/login'));
              }}
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { unreadCount } = useMarket();
  const [mobileSearch, setMobileSearch] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMobileSearch(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2 px-4 md:h-16 md:gap-3 md:px-6">
        <Link to="/dashboard" className="md:hidden" aria-label="MemeCoin Radar home">
          <span className="min-[400px]:hidden"><Logo showText={false} /></span>
          <span className="hidden text-sm min-[400px]:block"><Logo /></span>
        </Link>
        <GlobalSearch className="hidden max-w-md flex-1 md:block" />
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <div className="hidden md:block">
            <ConnectionStatus />
          </div>
          <ConnectionDot className="px-1 md:hidden" />
          <button onClick={() => setMobileSearch((s) => !s)} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg md:hidden" aria-label={mobileSearch ? 'Close search' : 'Search tokens'} aria-expanded={mobileSearch}>
            {mobileSearch ? <X className="size-5" /> : <Search className="size-5" />}
          </button>
          <Link to="/alerts" className="relative grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Alerts, ${unreadCount} unread`}>
            <Bell className="size-5" />
            {unreadCount > 0 && <span className="num absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </Link>
          <UserMenu />
        </div>
      </div>
      {mobileSearch && (
        <div className="animate-slide-up border-t border-line px-4 py-3 md:hidden">
          <GlobalSearch />
        </div>
      )}
    </header>
  );
}
