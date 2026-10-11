import { CandlestickSeries, createChart, HistogramSeries, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { useEffect, useMemo, useRef } from 'react';
import { toCandles } from '../../../shared/candles';
import type { Timeframe, Token } from '../../types';
import { formatCompactUsd, formatPercent } from '../../utils/format';
import { ChartEmpty } from './chartTheme';

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

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

interface CandleChartProps {
  token: Token;
  timeframe: Timeframe;
  height?: number;
  /** Market cap is what the rest of the app shows; price is available for trading views. */
  field?: 'mcap' | 'price';
  /** Horizontal lines — entries, stop and targets when a plan exists. */
  levels?: ChartLevel[];
}

/**
 * TradingView Lightweight Charts, the same engine the launchpads use: crosshair, pan and zoom,
 * candles on market cap with a volume histogram underneath. Data comes from the recorded ticks.
 */
export function CandleChart({ token, timeframe, height = 320, field = 'mcap', levels = [] }: CandleChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const fitted = useRef(false);

  const { window: span, bucket } = SPAN[timeframe];
  const candles = useMemo(() => {
    const from = Date.now() - span;
    return toCandles(
      token.history.filter((h) => h.t >= from),
      bucket,
      field,
    );
  }, [token.history, span, bucket, field]);

  // Create once; the data effect below keeps it current.
  useEffect(() => {
    if (!box.current) return;
    const up = css('--color-primary', '#22e07a');
    const down = css('--color-danger', '#ef4444');
    const text = css('--color-muted', '#8b9bb4');
    const grid = css('--color-line', '#1e293b');
    const instance = createChart(box.current, {
      layout: { background: { color: 'transparent' }, textColor: text, attributionLogo: false, fontSize: 11 },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid, scaleMargins: { top: 0.1, bottom: 0.26 } },
      timeScale: { borderColor: grid, timeVisible: true, secondsVisible: span <= 5 * 60_000 },
      crosshair: { mode: 0 },
      localization: { priceFormatter: (v: number) => formatCompactUsd(v) },
      autoSize: true,
    });
    candleSeries.current = instance.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
      priceFormat: { type: 'custom', formatter: (v: number) => formatCompactUsd(v), minMove: 0.000000001 },
    });
    volumeSeries.current = instance.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    instance.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chart.current = instance;
    fitted.current = false;
    return () => {
      instance.remove();
      chart.current = null;
      candleSeries.current = null;
      volumeSeries.current = null;
    };
  }, [span]);

  // Data: replacing the whole series keeps it correct when the timeframe or token changes.
  useEffect(() => {
    const series = candleSeries.current;
    if (!series || !candles.length) return;
    series.setData(
      candles.map((c) => ({ time: (c.t / 1000) as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
    volumeSeries.current?.setData(
      candles.map((c) => ({
        time: (c.t / 1000) as UTCTimestamp,
        value: c.volume,
        color: c.up ? `${css('--color-primary', '#22e07a')}55` : `${css('--color-danger', '#ef4444')}55`,
      })),
    );
    if (!fitted.current) {
      chart.current?.timeScale().fitContent();
      fitted.current = true;
    }
  }, [candles]);

  // Entry / stop / target lines.
  useEffect(() => {
    const series = candleSeries.current;
    if (!series) return;
    const lines = levels.map((l) =>
      series.createPriceLine({
        price: l.value,
        color: l.color,
        lineWidth: 1,
        lineStyle: l.dashed === false ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: l.label,
      }),
    );
    return () => lines.forEach((line) => series.removePriceLine(line));
  }, [levels]);

  // The container always renders: the chart is created once, and mounting it only after data
  // arrived would leave the setup effect pointing at a node that never existed.
  const last = candles[candles.length - 1];
  const change = last ? last.close - last.open : 0;
  const changePct = last && last.open > 0 ? (change / last.open) * 100 : 0;
  const tone = last?.up ? 'text-primary' : 'text-danger';

  return (
    <div className="w-full min-w-0" role="img" aria-label={`${token.symbol} candles, ${timeframe}${last ? `, last ${formatCompactUsd(last.close)}` : ''}`}>
      <div className="num mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px]">
        <span className="font-semibold text-fg">{token.symbol}</span>
        <span className="text-muted">
          {field === 'mcap' ? 'Market cap' : 'Price'} · {timeframe}
        </span>
        {last && (
          <>
            <span className={tone}>
              O {formatCompactUsd(last.open)} H {formatCompactUsd(last.high)} L {formatCompactUsd(last.low)} C {formatCompactUsd(last.close)}
            </span>
            <span className={tone}>
              {change >= 0 ? '+' : ''}
              {formatCompactUsd(change)} ({formatPercent(changePct)})
            </span>
          </>
        )}
      </div>
      <div className="relative w-full" style={{ height }}>
        <div ref={box} className="absolute inset-0" />
        {candles.length < 2 && (
          <div className="absolute inset-0">
            <ChartEmpty height={height} label="Collecting live candles…" />
          </div>
        )}
      </div>
    </div>
  );
}
