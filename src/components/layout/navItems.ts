import {
  ArrowLeftRight,
  BadgeCheck,
  Bell,
  Bot,
  CandlestickChart,
  ChartLine,
  Coins,
  FileText,
  Gauge,
  HelpCircle,
  House,
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
    title: 'Overview',
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
    title: 'Activity',
    items: [
      { to: '/trade', label: 'Paper Trading', icon: ArrowLeftRight },
      { to: '/bot', label: 'Trading Bot', icon: Bot },
      { to: '/portfolio', label: 'Portfolio', icon: PieChart },
    ],
  },
  {
    title: 'Others',
    items: [
      { to: '/pro', label: 'Pro', icon: BadgeCheck },
      { to: '/settings/telegram', label: 'Telegram Alerts', icon: Send },
      { to: '/settings', label: 'Settings', icon: Settings, end: true },
      { to: '/how-it-works', label: 'How It Works', icon: HelpCircle },
    ],
  },
];

/**
 * Phone tab bar, in the reference's vocabulary: a chart, a house, a grid. Home takes the raised
 * centre because the button under your thumb should be the way back, not a destination you reach
 * for once.
 */
export const MOBILE_LEFT: NavItem[] = [
  { to: '/tokens', label: 'Coins', icon: ChartLine },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
];

export const MOBILE_CENTER: NavItem = { to: '/dashboard', label: 'Home', icon: House };

export const MOBILE_RIGHT: NavItem[] = [{ to: '/alerts', label: 'Alerts', icon: Bell, badge: 'alerts' }];

export const MOBILE_PRIMARY: NavItem[] = [...MOBILE_LEFT, MOBILE_CENTER, ...MOBILE_RIGHT];
