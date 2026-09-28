import type { HistoryPoint } from './types.ts';

/**
 * OHLC candles built from the recorded history. Each reading is a tick, so a candle's open is the
 * first tick in its bucket and its close the last — the same way an exchange prints them.
 */
export interface Candle {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Rises or holds = green, falls = red. */
  up: boolean;
}

export function toCandles(history: HistoryPoint[], bucketMs: number, field: 'mcap' | 'price' = 'mcap'): Candle[] {
  if (bucketMs <= 0) return [];
  const out: Candle[] = [];
  for (const p of history) {
    const value = field === 'mcap' ? p.mcap : p.price;
    if (!(value > 0)) continue;
    const t = Math.floor(p.t / bucketMs) * bucketMs;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.high = Math.max(last.high, value);
      last.low = Math.min(last.low, value);
      last.close = value;
      last.volume += p.volume;
      last.up = last.close >= last.open;
    } else {
      out.push({ t, open: value, high: value, low: value, close: value, volume: p.volume, up: true });
    }
  }
  return out;
}
