import type { Fingerprints } from './fingerprints.js';
import { buildBrowserChecks } from './matcher.js';
import { addMulti, type Collected } from './collected.js';
import { extractFromHtml, runDomChecksStatic } from './extractHtml.js';
import { safeFetch } from './safeFetch.js';
import { ScanError } from './urlGuard.js';

/** Fallback collector: one plain HTTP request, no JavaScript execution. */
export async function collectWithFetch(target: URL, fp: Fingerprints): Promise<Collected> {
  let res;
  try {
    res = await safeFetch(target.toString(), { timeoutMs: 20_000, maxBytes: 1_500_000 });
  } catch (err: any) {
    if (err instanceof ScanError) throw err;
    if (err?.name === 'TimeoutError') throw new ScanError('The site took too long to respond.', 'timeout');
    throw new ScanError(`Couldn't load the site: ${err?.cause?.code ?? err?.message ?? err}`, 'unreachable');
  }

  const headers: Record<string, string[]> = {};
  const cookies: Record<string, string[]> = {};
  res.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'set-cookie') addMulti(headers, name, value);
  });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    addMulti(headers, 'set-cookie', sc);
    const [pair] = sc.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) addMulti(cookies, pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }

  const { $ } = extractFromHtml(res.text, res.url);
  const dom = runDomChecksStatic($, buildBrowserChecks(fp).dom);

  return {
    mode: 'fetch',
    finalUrl: res.url,
    status: res.status,
    redirects: res.redirects,
    headers,
    cookies,
    html: res.text,
    htmlBytes: Buffer.byteLength(res.text),
    css: '',
    js: new Map(),
    dom,
    requests: [],
    warnings: ['Partial scan: no headless browser was available, so JavaScript-only technologies may be missing.'],
  };
}
