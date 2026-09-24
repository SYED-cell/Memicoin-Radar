import { HttpError } from './http.ts';

/**
 * Minimal schema validation. Each field returns the coerced value or throws with a field-level
 * message, collected into a 422 response.
 */
type Rule<T> = (v: unknown, field: string) => T;

export const v = {
  string:
    (opts: { min?: number; max?: number; pattern?: RegExp; trim?: boolean; message?: string } = {}): Rule<string> =>
    (val, field) => {
      if (typeof val !== 'string') throw new Error(`${field} is required`);
      const s = opts.trim === false ? val : val.trim();
      if (opts.min !== undefined && s.length < opts.min) throw new Error(opts.message ?? `${field} must be at least ${opts.min} characters`);
      if (opts.max !== undefined && s.length > opts.max) throw new Error(`${field} must be at most ${opts.max} characters`);
      if (opts.pattern && !opts.pattern.test(s)) throw new Error(opts.message ?? `${field} is invalid`);
      return s;
    },
  email: (): Rule<string> => (val, field) => {
    const s = v.string({ max: 254 })(val, field).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new Error('Enter a valid email address');
    return s;
  },
  password: (): Rule<string> => (val, field) => {
    const s = v.string({ min: 8, max: 128, trim: false })(val, field);
    if (!/[a-zA-Z]/.test(s) || !/[0-9]/.test(s)) throw new Error('Password must include letters and numbers');
    return s;
  },
  number:
    (opts: { min?: number; max?: number; integer?: boolean } = {}): Rule<number> =>
    (val, field) => {
      const n = typeof val === 'string' && val.trim() !== '' ? Number(val) : val;
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`${field} must be a number`);
      if (opts.integer && !Number.isInteger(n)) throw new Error(`${field} must be an integer`);
      if (opts.min !== undefined && n < opts.min) throw new Error(`${field} must be ≥ ${opts.min}`);
      if (opts.max !== undefined && n > opts.max) throw new Error(`${field} must be ≤ ${opts.max}`);
      return n;
    },
  boolean: (): Rule<boolean> => (val, field) => {
    if (typeof val !== 'boolean') throw new Error(`${field} must be true or false`);
    return val;
  },
  oneOf:
    <T extends string>(values: readonly T[]): Rule<T> =>
    (val, field) => {
      if (typeof val !== 'string' || !values.includes(val as T)) throw new Error(`${field} must be one of ${values.join(', ')}`);
      return val as T;
    },
  optional:
    <T>(rule: Rule<T>): Rule<T | undefined> =>
    (val, field) =>
      val === undefined || val === null || val === '' ? undefined : rule(val, field),
  mint: (): Rule<string> => (val, field) => v.string({ min: 32, max: 44, pattern: /^[1-9A-HJ-NP-Za-km-z]+$/, message: `${field} is not a valid Solana address` })(val, field),
};

export function validate<S extends Record<string, Rule<unknown>>>(input: unknown, schema: S): { [K in keyof S]: ReturnType<S[K]> } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Expected a JSON object', 'bad_request');
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const [key, rule] of Object.entries(schema)) {
    try {
      out[key] = rule(src[key], key);
    } catch (e) {
      errors[key] = e instanceof Error ? e.message : 'Invalid value';
    }
  }
  if (Object.keys(errors).length) throw new HttpError(422, Object.values(errors)[0], 'validation_error', errors);
  return out as { [K in keyof S]: ReturnType<S[K]> };
}
