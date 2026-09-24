import type { Breakdown, Factor } from './types.ts';

export interface FactorDef<Ctx> {
  key: string;
  label: string;
  description: string;
  weight: number;
  /** Returns 0..1 (or null when the input data is unavailable) plus human-readable evidence. */
  evaluate: (ctx: Ctx) => { value: number | null; detail: string };
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Weighted aggregation with transparent handling of missing data: weights of unavailable factors
 * are redistributed across available ones, and `coverage` reports how much of the model had data.
 */
export function aggregate(factors: Omit<Factor, 'points'>[]): Breakdown {
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const available = factors.filter((f) => f.value !== null);
  const availableWeight = available.reduce((s, f) => s + f.weight, 0);
  const scale = availableWeight > 0 ? 100 / availableWeight : 0;
  const withPoints: Factor[] = factors.map((f) => ({
    ...f,
    points: f.value === null ? 0 : Math.round(f.value * f.weight * scale * 10) / 10,
  }));
  const total = Math.round(withPoints.reduce((s, f) => s + f.points, 0));
  return { total: Math.min(100, Math.max(0, total)), factors: withPoints, coverage: totalWeight ? availableWeight / totalWeight : 0 };
}

export function runFactors<Ctx>(defs: FactorDef<Ctx>[], ctx: Ctx): Omit<Factor, 'points'>[] {
  return defs.map((d) => {
    const { value, detail } = d.evaluate(ctx);
    return { key: d.key, label: d.label, description: d.description, weight: d.weight, value: value === null ? null : clamp01(value), detail };
  });
}

export const pct = (v: number, digits = 0) => `${v.toFixed(digits)}%`;
export const usd = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;
