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

export const MOBILE_PRIMARY: NavItem[] = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/tokens', label: 'Tokens', icon: Coins },
  { to: '/alerts', label: 'Alerts', icon: Bell, badge: 'alerts' },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
];
