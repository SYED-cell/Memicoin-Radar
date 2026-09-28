import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toCandles, type Candle } from '../../../shared/candles';
import type { Timeframe, Token } from '../../types';
import { formatCompactUsd, formatDateTime, formatPercent } from '../../utils/format';
import { AXIS_PROPS, ChartEmpty, ChartTooltip, formatAxisTime, GRID_PROPS, spanOf } from './chartTheme';

/** Window shown, and how much time each candle covers. */
const SPAN: Record<Timeframe, { window: number; bucket: number }> = {
  '1M': { window: 60_000, bucket: 2_000 },
  '5M': { window: 5 * 60_000, bucket: 5_000 },
  '1H': { window: 3_600_000, bucket: 60_000 },
  '4H': { window: 4 * 3_600_000, bucket: 5 * 60_000 },
  D: { window: 24 * 3_600_000, bucket: 20 * 60_000 },
};

export interface ChartLevel {
  label: string;
  value: number;
  color: string;
  dashed?: boolean;
}

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
  /** Horizontal lines — entry, stop and targets when a plan exists. */
  levels?: ChartLevel[];
}

export function CandleChart({ token, timeframe, height = 320, field = 'mcap', levels = [] }: CandleChartProps) {
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

  const last = rows[rows.length - 1];
  const change = last.close - last.open;
  const changePct = last.open > 0 ? (change / last.open) * 100 : 0;
  const lows = rows.map((r) => r.low);
  const highs = rows.map((r) => r.high);
  const lo = Math.min(...lows, ...levels.map((l) => l.value));
  const hi = Math.max(...highs, ...levels.map((l) => l.value));
  const pad = (hi - lo) * 0.08 || lo * 0.02;
  const volumes = rows.map((r) => r.volume);
  const hasVolume = volumes.some((v) => v > 0);
  const chartHeight = hasVolume ? height * 0.74 : height;
  const tone = last.up ? 'text-primary' : 'text-danger';

  return (
    <div className="w-full min-w-0" role="img" aria-label={`${token.symbol} candles, ${timeframe}, last ${formatCompactUsd(last.close)}`}>
      {/* Reading for the newest candle, the way an exchange prints it. */}
      <div className="num mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px]">
        <span className="font-semibold text-fg">{token.symbol}</span>
        <span className="text-muted">{field === 'mcap' ? 'Market cap' : 'Price'} · {timeframe}</span>
        <span className={tone}>
          O {formatCompactUsd(last.open)} H {formatCompactUsd(last.high)} L {formatCompactUsd(last.low)} C {formatCompactUsd(last.close)}
        </span>
        <span className={tone}>
          {change >= 0 ? '+' : ''}
          {formatCompactUsd(change)} ({formatPercent(changePct)})
        </span>
      </div>

      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} syncId="candles">
            <CartesianGrid {...GRID_PROPS} />
            <XAxis {...AXIS_PROPS} dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => formatAxisTime(t, spanOf(rows))} hide={hasVolume} />
            <YAxis {...AXIS_PROPS} domain={[lo - pad, hi + pad]} width={58} tickFormatter={(v: number) => formatCompactUsd(v)} />
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
                      ...(row.volume > 0 ? ([['Volume', formatCompactUsd(row.volume)]] as [string, string][]) : []),
                    ],
                  })}
                />
              )}
            />
            {levels.map((l) => (
              <ReferenceLine
                key={l.label}
                y={l.value}
                stroke={l.color}
                strokeDasharray={l.dashed === false ? undefined : '4 4'}
                label={{ value: `${l.label} ${formatCompactUsd(l.value)}`, position: 'insideTopLeft', fill: l.color, fontSize: 10 }}
              />
            ))}
            <ReferenceLine
              y={last.close}
              stroke={last.up ? 'var(--color-primary)' : 'var(--color-danger)'}
              strokeDasharray="2 3"
              label={{ value: formatCompactUsd(last.close), position: 'right', fill: last.up ? 'var(--color-primary)' : 'var(--color-danger)', fontSize: 10 }}
            />
            <Bar dataKey="range" shape={<CandleShape />} isAnimationActive={false} maxBarSize={14} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Volume only appears when the providers actually reported trades in this window. */}
      {hasVolume && (
        <div style={{ height: height * 0.26 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 2, right: 6, left: 0, bottom: 0 }} syncId="candles">
              <XAxis {...AXIS_PROPS} dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => formatAxisTime(t, spanOf(rows))} />
              <YAxis {...AXIS_PROPS} width={58} tickFormatter={(v: number) => formatCompactUsd(v)} tickCount={3} />
              <Bar dataKey="volume" isAnimationActive={false} maxBarSize={14} shape={(p: { x?: number; y?: number; width?: number; height?: number; payload?: CandleRow }) => (
                <rect x={p.x} y={p.y} width={p.width} height={Math.max(0, p.height ?? 0)} fill={p.payload?.up ? 'var(--color-primary)' : 'var(--color-danger)'} opacity={0.45} />
              )} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
