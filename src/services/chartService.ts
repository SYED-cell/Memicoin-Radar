import type { ChartMarker, HistoryPoint, SeriesPoint, Timeframe, Token, Transaction } from '../types';

export const TIMEFRAMES: Timeframe[] = ['5M', '1H', '6H', '24H'];

const SPAN: Record<Timeframe, number> = { '5M': 5 * 60_000, '1H': 3_600_000, '6H': 6 * 3_600_000, '24H': 24 * 3_600_000 };
/** Target bucket count per range — keeps charts readable and fast regardless of history length. */
const BUCKETS = 90;

/**
 * Real recorded history (market polls + streamed trades), bucketed for the requested range.
 * Volume is summed per bucket; price/liquidity/holders take the bucket's last value.
 */
export function getSeries(token: Token, tf: Timeframe, now = Date.now()): SeriesPoint[] {
  const from = now - SPAN[tf];
  const pts = token.history.filter((h) => h.t >= from);
  if (pts.length === 0) return [];
  const start = Math.max(from, pts[0].t);
  const bucketMs = Math.max(1000, (now - start) / BUCKETS);
  const out: SeriesPoint[] = [];
  let cur: HistoryPoint | null = null;
  let curKey = -1;
  for (const p of pts) {
    const key = Math.floor((p.t - start) / bucketMs);
    if (!cur || key !== curKey) {
      if (cur) out.push({ ...cur, label: '' });
      cur = { ...p };
      curKey = key;
    } else {
      cur = { ...p, volume: cur.volume + p.volume, buyVolume: cur.buyVolume + p.buyVolume, sellVolume: cur.sellVolume + p.sellVolume };
    }
  }
  if (cur) out.push({ ...cur, label: '' });
  return out;
}

/** Markers for the user's own paper trades plus the largest observed on-chain buys/sells. */
export function getMarkers(token: Token, series: SeriesPoint[], trades: Transaction[] = []): ChartMarker[] {
  if (series.length < 2) return [];
  const from = series[0].t;
  const to = series[series.length - 1].t;
  const nearest = (t: number) => series.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best));
  const markers: ChartMarker[] = [];
  const big = [...token.trades].filter((x) => x.t >= from && x.t <= to).sort((a, b) => b.usd - a.usd).slice(0, 4);
  for (const x of big) markers.push({ t: nearest(x.t).t, price: nearest(x.t).price, side: x.side, label: `${x.isCreator ? 'Creator' : 'Large'} ${x.side}` });
  for (const tx of trades) {
    if (tx.createdAt < from || tx.createdAt > to) continue;
    const p = nearest(tx.createdAt);
    markers.push({ t: p.t, price: p.price, side: tx.side, label: `Your ${tx.side}` });
  }
  return markers;
}

/** Last-hour price path for sparklines. */
export function getSparkline(token: Token, points = 30): number[] {
  const h = token.history.slice(-points).map((p) => p.price);
  return h.length >= 2 ? h : token.price ? [token.price, token.price] : [];
}
