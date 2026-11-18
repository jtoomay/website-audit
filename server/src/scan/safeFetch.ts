import { assertPublicHost } from './urlGuard.js';

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface SafeResponse {
  url: string;
  status: number;
  headers: Headers;
  text: string;
  redirects: string[];
  truncated: boolean;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  followRedirects?: boolean;
  accept?: string;
}

/**
 * fetch() that re-checks every redirect hop against the private-network block list,
 * enforces a timeout and caps the body size.
 */
export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const { timeoutMs = 10_000, maxBytes = 2_000_000, maxRedirects = 5, followRedirects = true } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  const redirects: string[] = [];
  let current = new URL(input);

  for (let hop = 0; ; hop++) {
    await assertPublicHost(current.hostname);
    const res = await fetch(current, {
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: opts.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const location = res.headers.get('location');
    if (followRedirects && res.status >= 300 && res.status < 400 && location) {
      if (hop >= maxRedirects) throw new Error('Too many redirects');
      res.body?.cancel().catch(() => {});
      redirects.push(current.toString());
      current = new URL(location, current);
      continue;
    }
    const { text, truncated } = await readCapped(res, maxBytes);
    return { url: current.toString(), status: res.status, headers: res.headers, text, redirects, truncated };
  }
}

async function readCapped(res: Response, maxBytes: number) {
  if (!res.body) return { text: '', truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      chunks.push(value.subarray(0, value.byteLength - (size - maxBytes)));
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return { text: new TextDecoder().decode(Buffer.concat(chunks)), truncated };
}

/** Never throws: returns null on any failure. Handy for optional probes. */
export async function tryFetch(input: string, opts?: SafeFetchOptions): Promise<SafeResponse | null> {
  try {
    return await safeFetch(input, opts);
  } catch {
    return null;
  }
}
