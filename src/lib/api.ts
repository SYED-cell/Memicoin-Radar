/**
 * Same-origin API client. Auth lives in httpOnly cookies (never readable by JS); the custom
 * X-Requested-With header plus the server's origin check protect against CSRF.
 * Expired access tokens are refreshed transparently once per failing request.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  constructor(status: number, message: string, code = 'error', fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

let refreshing: Promise<boolean> | null = null;
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function refresh(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'x-requested-with': 'radar' } })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; retry?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      signal: opts.signal,
      headers: { 'x-requested-with': 'radar', ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Network error — check your connection', 'network');
  }
  if (res.status === 401 && opts.retry !== false && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/refresh')) {
    if (await refresh()) return api<T>(path, { ...opts, retry: false });
    onUnauthorized?.();
  }
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(res.status, res.status >= 500 ? 'Server error — please try again' : 'Unexpected response from server', 'bad_response');
  }
  if (!res.ok) {
    const d = data as { error?: string; code?: string; fields?: Record<string, string> };
    throw new ApiError(res.status, d.error ?? `Request failed (${res.status})`, d.code, d.fields);
  }
  return data as T;
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

export { refresh as refreshSession };
