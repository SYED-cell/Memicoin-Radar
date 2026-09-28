import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toCandles, type Candle } from '../../../shared/candles';
import type { Timeframe, Token } from '../../types';
import { formatCompactUsd, formatDateTime } from '../../utils/format';
import { AXIS_PROPS, ChartEmpty, ChartTooltip, formatAxisTime, GRID_PROPS, spanOf } from './chartTheme';

/** Window shown, and how much time each candle covers. */
const SPAN: Record<Timeframe, { window: number; bucket: number }> = {
  '5M': { window: 5 * 60_000, bucket: 5_000 },
  '1H': { window: 3_600_000, bucket: 60_000 },
  '6H': { window: 6 * 3_600_000, bucket: 5 * 60_000 },
  '24H': { window: 24 * 3_600_000, bucket: 20 * 60_000 },
};

interface CandleRow extends Candle {
  /** Recharts sizes the bar over this range; the shape reads OHLC off the row. */
  range: [number, number];
}

/**
 * Recharts has no candlestick, so a range bar spans low→high and this draws the wick and body
 * inside it. `y`/`height` map high→low, which is all the scale information the body needs.
 */
function CandleShape(props: { x?: number; y?: number; width?: number; height?: number; payload?: CandleRow }) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;
  const { high, low, open, close, up } = payload;
  const color = up ? 'var(--color-primary)' : 'var(--color-danger)';
  const span = high - low;
  // Flat candle: no range to interpolate over, so draw a single line at the close.
  const at = (v: number) => (span > 0 ? y + ((high - v) / span) * height : y + height / 2);
  const bodyTop = at(Math.max(open, close));
  const bodyH = Math.max(1, Math.abs(at(open) - at(close)));
  const bodyW = Math.max(1, width * 0.7);
  return (
    <g>
      <line x1={x + width / 2} x2={x + width / 2} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={x + (width - bodyW) / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
    </g>
  );
}

interface CandleChartProps {
  token: Token;
  timeframe: Timeframe;
  height?: number;
  /** Market cap is what the rest of the app shows; price is available for trading views. */
  field?: 'mcap' | 'price';
}

export function CandleChart({ token, timeframe, height = 280, field = 'mcap' }: CandleChartProps) {
  const { window: span, bucket } = SPAN[timeframe];
  const rows = useMemo<CandleRow[]>(() => {
    const from = Date.now() - span;
    return toCandles(
      token.history.filter((h) => h.t >= from),
      bucket,
      field,
    ).map((c) => ({ ...c, range: [c.low, c.high] }));
  }, [token.history, span, bucket, field]);

  if (rows.length < 2) return <ChartEmpty height={height} label="Collecting live candles…" />;

  const lows = rows.map((r) => r.low);
  const highs = rows.map((r) => r.high);
  const pad = (Math.max(...highs) - Math.min(...lows)) * 0.08 || Math.min(...lows) * 0.02;
  const last = rows[rows.length - 1];

  return (
    <div style={{ height }} className="w-full min-w-0" role="img" aria-label={`${token.symbol} candles, ${timeframe}, last ${formatCompactUsd(last.close)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis {...AXIS_PROPS} dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => formatAxisTime(t, spanOf(rows))} />
          <YAxis {...AXIS_PROPS} domain={[Math.min(...lows) - pad, Math.max(...highs) + pad]} width={58} tickFormatter={(v: number) => formatCompactUsd(v)} />
          <Tooltip
            content={(p) => (
              <ChartTooltip<CandleRow>
                active={p.active}
                payload={p.payload}
                render={(row) => ({
                  title: formatDateTime(row.t),
                  rows: [
                    ['Open', formatCompactUsd(row.open)],
                    ['High', formatCompactUsd(row.high), 'var(--color-primary)'],
                    ['Low', formatCompactUsd(row.low), 'var(--color-danger)'],
                    ['Close', formatCompactUsd(row.close), row.up ? 'var(--color-primary)' : 'var(--color-danger)'],
                  ],
                })}
              />
            )}
          />
          {/* Without a cap, a handful of candles stretch into slabs across the width. */}
          <Bar dataKey="range" shape={<CandleShape />} isAnimationActive={false} maxBarSize={14} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
