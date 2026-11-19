/**
 * Tiny typed client for the FastAPI backend.
 *
 * Every failure becomes an `ApiError` with a `kind` the UI can translate
 * (no connection, wrong password, rate limited…), so screens never have to
 * parse HTTP details themselves.
 */
import type { AuthResponse, HealthResponse, PushResponse, SnapshotDto, SyncOp, ApiUser } from './types';

export type ApiErrorKind =
  | 'network' // server unreachable (wrong address, offline, firewall)
  | 'timeout'
  | 'unauthorized' // 401: wrong login, or the session expired
  | 'forbidden' // 403: wrong current password
  | 'conflict' // 409: e.g. email already registered
  | 'validation' // 422: input rejected
  | 'rateLimited' // 429: too many wrong passwords
  | 'notFound'
  | 'server' // 5xx
  | 'badResponse'; // not our API on that address

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status = 0,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'notFound',
  409: 'conflict',
  422: 'validation',
  429: 'rateLimited',
};

/** FastAPI sends `detail` as a string, or (for 422) a list of {loc, msg}. */
function detailMessage(body: unknown): string | null {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : '';
    const msg = (first.msg ?? '').replace(/^Value error, /, '');
    return field && field !== 'body' ? `${field}: ${msg}` : msg;
  }
  return null;
}

/** Normalise what the user typed into a base URL: adds http:// and drops trailing slashes. */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

export interface ApiClientOptions {
  baseUrl: string;
  token?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createApiClient({ baseUrl, token, timeoutMs = 12_000, fetchImpl = fetch }: ApiClientOptions) {
  const root = normalizeBaseUrl(baseUrl);

  async function request<T>(method: string, path: string, body?: unknown, ms = timeoutMs): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    let res: Response;
    try {
      res = await fetchImpl(`${root}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      const aborted = (e as { name?: string })?.name === 'AbortError';
      throw new ApiError(aborted ? 'timeout' : 'network', aborted ? 'Request timed out' : 'Could not reach the server');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) return undefined as T;
    let data: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new ApiError('badResponse', 'The server sent something unexpected', res.status);
      }
    }
    if (!res.ok) {
      const kind = KIND_BY_STATUS[res.status] ?? (res.status >= 500 ? 'server' : 'badResponse');
      const retry = Number(res.headers.get('Retry-After'));
      throw new ApiError(kind, detailMessage(data) ?? `HTTP ${res.status}`, res.status, Number.isFinite(retry) && retry > 0 ? retry : undefined);
    }
    return data as T;
  }

  return {
    baseUrl: root,
    /** Confirms the address really is a Focus & Flow server. */
    async health(): Promise<HealthResponse> {
      const h = await request<HealthResponse>('GET', '/health', undefined, 5_000);
      if (!h || h.app !== 'focus-flow') throw new ApiError('badResponse', 'That address is not a Focus & Flow server');
      return h;
    },
    signup: (email: string, password: string, name: string) => request<AuthResponse>('POST', '/auth/signup', { email, password, name }),
    login: (email: string, password: string) => request<AuthResponse>('POST', '/auth/login', { email, password }),
    me: () => request<ApiUser>('GET', '/auth/me'),
    deleteAccount: (password: string) => request<void>('DELETE', '/auth/me', { password }),
    pull: () => request<SnapshotDto>('GET', '/sync'),
    push: (ops: SyncOp[]) => request<PushResponse>('POST', '/sync/push', { ops }, 30_000),
    merge: (snapshot: Omit<SnapshotDto, 'serverTime'>) => request<SnapshotDto>('POST', '/sync/merge', snapshot, 30_000),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
