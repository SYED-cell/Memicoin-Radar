import { cn } from '../../utils/cn';

export function scoreTone(score: number): string {
  if (score >= 80) return 'text-primary border-primary/35 bg-primary/10';
  if (score >= 65) return 'text-accent border-accent/35 bg-accent/10';
  if (score >= 45) return 'text-warning border-warning/35 bg-warning/10';
  return 'text-danger border-danger/35 bg-danger/10';
}

export function scoreTextTone(score: number): string {
  if (score >= 80) return 'text-primary';
  if (score >= 65) return 'text-accent';
  if (score >= 45) return 'text-warning';
  return 'text-danger';
}

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md';
  showMax?: boolean;
  className?: string;
}

export function ScoreBadge({ score, size = 'sm', showMax = true, className }: ScoreBadgeProps) {
  return (
    <span
      className={cn('chip num', scoreTone(score), size === 'md' && 'px-2.5 py-1 text-xs', className)}
      title={`Opportunity score ${score} out of 100`}
    >
      {score}
      {showMax && <span className="opacity-60">/100</span>}
    </span>
  );
}
