import type { ScanRow, UsageInfo } from '../../../shared/report';
import { supabase } from './supabase';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: any,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("Can't reach the scanner API. Is the server running (npm run dev)?", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body);
  return body as T;
}

export const api = {
  me: () => call<{ email: string; usage: UsageInfo }>('/api/me'),
  scan: (url: string) =>
    call<{ scan: ScanRow; usage: UsageInfo }>('/api/scan', { method: 'POST', body: JSON.stringify({ url }) }),
};
