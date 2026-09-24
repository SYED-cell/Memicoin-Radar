import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getSeries } from '../../services/chartService';
import type { SeriesPoint, Timeframe, Token } from '../../types';
import { formatCompactUsd, formatDateTime } from '../../utils/format';
import { AXIS_PROPS, ChartTooltip, formatAxisTime, GRID_PROPS, ChartEmpty, spanOf } from './chartTheme';

export function VolumeChart({ token, timeframe, height = 200 }: { token: Token; timeframe: Timeframe; height?: number }) {
  const series = useMemo(() => getSeries(token, timeframe), [token, timeframe]);
  if (series.length < 2) return <ChartEmpty height={height} />;
  return (
    <div style={{ height }} className="w-full min-w-0" role="img" aria-label={`${token.symbol} buy and sell volume, ${timeframe}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barCategoryGap={1}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="t" tickFormatter={(t: number) => formatAxisTime(t, spanOf(series))} minTickGap={36} {...AXIS_PROPS} />
          <YAxis orientation="right" width={52} tickFormatter={(v: number) => formatCompactUsd(v)} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-3)', opacity: 0.4 }}
            content={(p) => (
              <ChartTooltip<SeriesPoint>
                active={p.active}
                payload={p.payload}
                render={(row) => ({
                  title: formatDateTime(row.t),
                  rows: [
                    ['Buy volume', formatCompactUsd(row.buyVolume), 'var(--color-primary)'],
                    ['Sell volume', formatCompactUsd(row.sellVolume), 'var(--color-danger)'],
                    ['Total', formatCompactUsd(row.volume)],
                  ],
                })}
              />
            )}
          />
          <Bar dataKey="buyVolume" stackId="v" fill="var(--color-primary)" fillOpacity={0.85} isAnimationActive={false} />
          <Bar dataKey="sellVolume" stackId="v" fill="var(--color-danger)" fillOpacity={0.75} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
