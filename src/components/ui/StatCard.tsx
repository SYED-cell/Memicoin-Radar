import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { changeColor, formatPercent } from '../../utils/format';
import { Sparkline } from './primitives';

interface StatCardProps {
  label: string;
  value: ReactNode;
  change?: number;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: 'primary' | 'accent' | 'danger' | 'warning';
  trend?: number[];
  onClick?: () => void;
}

const ICON_TONE = {
  primary: 'bg-primary/12 text-primary',
  accent: 'bg-accent/12 text-accent',
  danger: 'bg-danger/12 text-danger',
  warning: 'bg-warning/12 text-warning',
};

export function StatCard({ label, value, change, hint, icon: Icon, tone = 'primary', trend, onClick }: StatCardProps) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={cn('card relative flex min-w-0 flex-col gap-1.5 overflow-hidden p-3.5 text-left sm:p-4', onClick && 'card-hover')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted">{label}</span>
        {Icon && (
          <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', ICON_TONE[tone])}>
            <Icon className="size-3.5" aria-hidden />
          </span>
        )}
      </div>
      <div className="num truncate text-xl font-bold tracking-tight sm:text-2xl">{value}</div>
      <div className="flex min-h-4 items-center justify-between gap-2">
        {change !== undefined ? (
          <span className={cn('num text-xs font-semibold', changeColor(change))}>{formatPercent(change)}</span>
        ) : (
          <span className="truncate text-xs text-muted">{hint}</span>
        )}
        {trend && trend.length > 1 && <Sparkline data={trend} className="h-6 w-16 shrink-0" />}
      </div>
    </Comp>
  );
}
