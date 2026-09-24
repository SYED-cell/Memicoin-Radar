import { useId, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getSeries } from '../../services/chartService';
import type { SeriesPoint, Timeframe, Token } from '../../types';
import { formatCompactUsd, formatDateTime, formatPercent } from '../../utils/format';
import { AXIS_PROPS, ChartTooltip, formatAxisTime, GRID_PROPS, ChartEmpty, spanOf } from './chartTheme';

export function LiquidityChart({ token, timeframe, height = 200 }: { token: Token; timeframe: Timeframe; height?: number }) {
  const gradientId = `liq${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const series = useMemo(() => getSeries(token, timeframe), [token, timeframe]);
  const first = series[0]?.liquidity ?? token.liquidity;
  if (series.length < 2) return <ChartEmpty height={height} />;
  return (
    <div style={{ height }} className="w-full min-w-0" role="img" aria-label={`${token.symbol} liquidity, ${timeframe}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => formatAxisTime(t, spanOf(series))} minTickGap={36} {...AXIS_PROPS} />
          <YAxis orientation="right" width={52} domain={['auto', 'auto']} tickFormatter={(v: number) => formatCompactUsd(v)} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ stroke: 'var(--color-line-strong)', strokeDasharray: '4 4' }}
            content={(p) => (
              <ChartTooltip<SeriesPoint>
                active={p.active}
                payload={p.payload}
                render={(row) => ({
                  title: formatDateTime(row.t),
                  rows: [
                    ['Liquidity', formatCompactUsd(row.liquidity), 'var(--color-accent)'],
                    ['vs. start', formatPercent((row.liquidity / first - 1) * 100)],
                  ],
                })}
              />
            )}
          />
          <Area type="monotone" dataKey="liquidity" stroke="var(--color-accent)" strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
