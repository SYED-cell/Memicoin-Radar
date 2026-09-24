import { useId, useMemo } from 'react';
import { Area, ComposedChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { getMarkers, getSeries } from '../../services/chartService';
import type { SeriesPoint, Timeframe, Token, Transaction } from '../../types';
import { formatCompactUsd, formatDateTime, formatPercent, formatPrice } from '../../utils/format';
import { AXIS_PROPS, ChartTooltip, formatAxisTime, GRID_PROPS, ChartEmpty, spanOf } from './chartTheme';

interface PriceChartProps {
  token: Token;
  timeframe: Timeframe;
  height?: number;
  showMarkers?: boolean;
  trades?: Transaction[];
  showAxis?: boolean;
}

export function PriceChart({ token, timeframe, height = 260, showMarkers = true, trades = [], showAxis = true }: PriceChartProps) {
  const gradientId = `price${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const series = useMemo(() => getSeries(token, timeframe), [token, timeframe]);
  const markers = useMemo(() => (showMarkers ? getMarkers(token, series, trades) : []), [token, series, trades, showMarkers]);
  const first = series[0]?.price ?? token.price;
  const up = token.price >= first;
  const color = up ? 'var(--color-primary)' : 'var(--color-danger)';

  if (series.length < 2) return <ChartEmpty height={height} />;
  return (
    <div style={{ height }} className="w-full min-w-0" aria-label={`${token.symbol} price chart, ${timeframe}, ${formatPercent((token.price / first - 1) * 100)}`} role="img">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t: number) => formatAxisTime(t, spanOf(series))}
            minTickGap={36}
            hide={!showAxis}
            {...AXIS_PROPS}
          />
          <YAxis
            dataKey="price"
            domain={['auto', 'auto']}
            orientation="right"
            width={showAxis ? 64 : 0}
            tickFormatter={(v: number) => formatPrice(v)}
            hide={!showAxis}
            {...AXIS_PROPS}
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-line-strong)', strokeDasharray: '4 4' }}
            content={(p) => (
              <ChartTooltip<SeriesPoint>
                active={p.active}
                payload={p.payload}
                render={(row) => ({
                  title: formatDateTime(row.t),
                  rows: [
                    ['Price', formatPrice(row.price), color],
                    ['Change', formatPercent((row.price / first - 1) * 100)],
                    ['Volume', formatCompactUsd(row.volume)],
                  ],
                })}
              />
            )}
          />
          <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: color }} />
          {markers.map((m, i) => (
            <ReferenceDot
              key={`${m.t}-${i}`}
              x={m.t}
              y={m.price}
              r={m.label.startsWith('Your') ? 6 : 4.5}
              fill={m.side === 'buy' ? 'var(--color-primary)' : 'var(--color-danger)'}
              stroke="var(--color-bg)"
              strokeWidth={2}
              ifOverflow="extendDomain"
              label={{ value: m.side === 'buy' ? 'B' : 'S', position: 'top', fill: m.side === 'buy' ? 'var(--color-primary)' : 'var(--color-danger)', fontSize: 10, fontWeight: 700 }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
