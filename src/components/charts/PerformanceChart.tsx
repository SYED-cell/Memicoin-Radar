import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PortfolioPoint } from '../../types';
import { formatCompactUsd, formatDateTime, formatSignedUsd, formatUsd } from '../../utils/format';
import { AXIS_PROPS, ChartTooltip, formatAxisTime, GRID_PROPS, spanOf } from './chartTheme';

export function PerformanceChart({ data, baseline, height = 220 }: { data: PortfolioPoint[]; baseline: number; height?: number }) {
  const gradientId = `perf${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const up = (data[data.length - 1]?.value ?? 0) >= (data[0]?.value ?? 0);
  const color = up ? 'var(--color-primary)' : 'var(--color-danger)';
  return (
    <div style={{ height }} className="w-full min-w-0" role="img" aria-label="Portfolio value over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => formatAxisTime(t, spanOf(data))} minTickGap={40} {...AXIS_PROPS} />
          <YAxis orientation="right" width={56} domain={['auto', 'auto']} tickFormatter={(v: number) => formatCompactUsd(v)} {...AXIS_PROPS} />
          <ReferenceLine y={baseline} stroke="var(--color-subtle)" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: 'var(--color-line-strong)', strokeDasharray: '4 4' }}
            content={(p) => (
              <ChartTooltip<PortfolioPoint>
                active={p.active}
                payload={p.payload}
                render={(row) => ({
                  title: formatDateTime(row.t),
                  rows: [
                    ['Value', formatUsd(row.value), color],
                    ['vs. start', formatSignedUsd(row.value - baseline)],
                  ],
                })}
              />
            )}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
