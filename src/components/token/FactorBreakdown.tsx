import { Info } from 'lucide-react';
import { useState } from 'react';
import type { Breakdown } from '../../types';
import { cn } from '../../utils/cn';
import { ProgressBar } from '../ui/primitives';

/**
 * Transparent factor-by-factor view of a score. `kind` controls colour semantics:
 * opportunity factors are good when high, risk factors are bad when high.
 */
export function FactorBreakdown({ breakdown, kind, dense = false }: { breakdown: Breakdown; kind: 'risk' | 'opportunity'; dense?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const tone = (v: number) => (kind === 'opportunity' ? (v >= 0.65 ? 'primary' : v >= 0.45 ? 'accent' : v >= 0.3 ? 'warning' : 'danger') : v >= 0.6 ? 'danger' : v >= 0.35 ? 'warning' : 'primary');
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
        <span>{breakdown.factors.filter((f) => f.value !== null).length}/{breakdown.factors.length} factors with data</span>
        <span className={cn('num', breakdown.coverage < 0.6 && 'text-warning')}>{Math.round(breakdown.coverage * 100)}% weight coverage</span>
      </div>
      {breakdown.floorReason && <p className="mb-2 rounded-lg border border-danger/30 bg-danger/10 p-2 text-xs text-danger">Floor applied: {breakdown.floorReason}</p>}
      <ul className={cn('divide-y divide-line', dense ? 'text-xs' : 'text-sm')}>
        {breakdown.factors.map((f) => {
          const expanded = open === f.key;
          return (
            <li key={f.key} className={dense ? 'py-2' : 'py-2.5'}>
              <div className="flex items-center gap-2">
                <button onClick={() => setOpen(expanded ? null : f.key)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium hover:text-primary" aria-expanded={expanded}>
                  <span className="truncate">{f.label}</span>
                  <Info className="size-3 shrink-0 text-subtle" aria-hidden />
                </button>
                <span className="num shrink-0 text-[11px] text-subtle">w{f.weight}</span>
                <span className={cn('num w-12 shrink-0 text-right font-semibold', f.value === null ? 'text-subtle' : `text-${tone(f.value)}`)}>{f.value === null ? 'n/a' : f.points.toFixed(1)}</span>
              </div>
              <div className="mt-1.5">
                {f.value === null ? <div className="h-1.5 rounded-full border border-dashed border-line" /> : <ProgressBar value={f.value * 100} tone={tone(f.value)} />}
              </div>
              <p className="mt-1 truncate text-[11px] text-muted" title={f.detail}>
                {f.detail}
              </p>
              {expanded && <p className="mt-1 animate-fade-in text-[11px] text-subtle">{f.description}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
