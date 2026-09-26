import {
  ArrowLeftRight,
  Bell,
  Bot,
  CandlestickChart,
  Coins,
  FileText,
  Gauge,
  HelpCircle,
  LayoutDashboard,
  PieChart,
  Radar,
  Send,
  Settings,
  ShieldAlert,
  Star,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: 'alerts';
  end?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Discover',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/tokens', label: 'Tokens', icon: Coins },
      { to: '/charts', label: 'Charts', icon: CandlestickChart },
      { to: '/alerts', label: 'Alerts', icon: Bell, badge: 'alerts' },
      { to: '/watchlist', label: 'Watchlist', icon: Star },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { to: '/scoring', label: 'Scoring Framework', icon: Gauge },
      { to: '/risk', label: 'Risk Engine', icon: ShieldAlert },
      { to: '/ai', label: 'AI Analysis', icon: Bot },
      { to: '/report', label: 'Daily Report', icon: FileText },
    ],
  },
  {
    title: 'Trading',
    items: [
      { to: '/trade', label: 'Paper Trading', icon: ArrowLeftRight },
      { to: '/portfolio', label: 'Portfolio', icon: PieChart },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/settings/telegram', label: 'Telegram Alerts', icon: Send },
      { to: '/settings', label: 'Settings', icon: Settings, end: true },
      { to: '/how-it-works', label: 'How It Works', icon: HelpCircle },
    ],
  },
];

/** Phone tab bar: two tabs, the raised live-feed action, then one tab and the "More" sheet. */
export const MOBILE_LEFT: NavItem[] = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
];

export const MOBILE_CENTER: NavItem = { to: '/tokens', label: 'Radar', icon: Radar };

export const MOBILE_RIGHT: NavItem[] = [{ to: '/alerts', label: 'Alerts', icon: Bell, badge: 'alerts' }];

export const MOBILE_PRIMARY: NavItem[] = [...MOBILE_LEFT, MOBILE_CENTER, ...MOBILE_RIGHT];
