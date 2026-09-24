import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { riskLevel } from '../../../shared/riskEngine.ts';
import type { RiskLevel } from '../../types';
import { cn } from '../../utils/cn';

export const RISK_TONE: Record<RiskLevel, string> = {
  Low: 'text-primary border-primary/35 bg-primary/10',
  Medium: 'text-warning border-warning/35 bg-warning/10',
  High: 'text-danger border-danger/35 bg-danger/10',
  Extreme: 'text-white border-danger bg-danger/80',
};

export const RISK_TEXT: Record<RiskLevel, string> = {
  Low: 'text-primary',
  Medium: 'text-warning',
  High: 'text-danger',
  Extreme: 'text-danger',
};

export function RiskBadge({ risk, compact = false, className }: { risk: number; compact?: boolean; className?: string }) {
  const level = riskLevel(risk);
  const Icon = level === 'Low' ? ShieldCheck : ShieldAlert;
  return (
    <span className={cn('chip', RISK_TONE[level], className)} title={`Risk score ${risk} out of 100 (${level})`}>
      <Icon className="size-3" aria-hidden />
      {compact ? level : `${level} · ${risk}`}
    </span>
  );
}
