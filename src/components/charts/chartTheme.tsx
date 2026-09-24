import type { ReactNode } from 'react';
import type { TooltipContentProps } from 'recharts';

export const AXIS_PROPS = {
  stroke: 'var(--color-subtle)',
  tick: { fill: 'var(--color-subtle)', fontSize: 10 },
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_PROPS = {
  stroke: 'var(--color-line)',
  strokeDasharray: '3 4',
  vertical: false,
} as const;

/** Axis label adapted to the visible span (seconds for very short ranges, dates for multi-day). */
export function formatAxisTime(t: number, spanMs: number): string {
  const d = new Date(t);
  if (spanMs <= 15 * 60_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (spanMs <= 36 * 3_600_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const spanOf = (points: { t: number }[]) => (points.length > 1 ? points[points.length - 1].t - points[0].t : 0);

/** Generic dark tooltip that renders rows derived from the hovered datum. */
export function ChartTooltip<Row>({
  active,
  payload,
  render,
}: Pick<TooltipContentProps<number, string>, 'active' | 'payload'> & { render: (row: Row) => { title: ReactNode; rows: [ReactNode, ReactNode, string?][] } }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;
  const { title, rows } = render(row);
  return (
    <div className="min-w-40 rounded-xl border border-line-strong bg-surface-2/95 px-3 py-2.5 text-xs shadow-2xl backdrop-blur">
      <p className="mb-1.5 font-medium text-muted">{title}</p>
      <div className="space-y-1">
        {rows.map(([k, v, color], i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              {color && <span className="size-2 rounded-full" style={{ background: color }} />}
              {k}
            </span>
            <span className="num font-semibold text-fg">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder while a young token has too little recorded history to draw. */
export function ChartEmpty({ height, label = 'Collecting live data…' }: { height: number; label?: string }) {
  return (
    <div style={{ height }} className="flex w-full items-center justify-center rounded-xl border border-dashed border-line text-xs text-muted">
      <span className="flex items-center gap-2">
        <span className="size-1.5 animate-pulse-dot rounded-full bg-primary" aria-hidden /> {label}
      </span>
    </div>
  );
}
