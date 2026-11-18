import type { SecurityCheck, SecurityInfo } from '../../../../shared/report.js';
import { tryFetch } from '../safeFetch.js';

const first = (h: Record<string, string[]>, k: string) => h[k]?.[0];

export async function checkSecurity(finalUrl: string, headers: Record<string, string[]>): Promise<SecurityInfo> {
  const url = new URL(finalUrl);
  const https = url.protocol === 'https:';

  // Does plain http:// redirect to https://?
  let httpRedirectsToHttps: boolean | undefined;
  const httpRes = await tryFetch(`http://${url.host}/`, { followRedirects: false, timeoutMs: 6000, maxBytes: 10_000 });
  if (httpRes) {
    const loc = httpRes.headers.get('location') ?? '';
    httpRedirectsToHttps = httpRes.status >= 300 && httpRes.status < 400 && loc.startsWith('https://');
  }

  const csp = first(headers, 'content-security-policy');
  const hsts = first(headers, 'strict-transport-security');
  const xfo = first(headers, 'x-frame-options');

  const checks: SecurityCheck[] = [
    { id: 'https', label: 'Served over HTTPS', pass: https },
    {
      id: 'http-redirect',
      label: 'HTTP redirects to HTTPS',
      pass: httpRedirectsToHttps ?? false,
      detail: httpRedirectsToHttps === undefined ? 'Could not check' : undefined,
    },
    { id: 'hsts', label: 'Strict-Transport-Security (HSTS)', pass: Boolean(hsts), detail: hsts },
    { id: 'csp', label: 'Content-Security-Policy', pass: Boolean(csp), detail: csp ? `${csp.slice(0, 80)}${csp.length > 80 ? '…' : ''}` : undefined },
    {
      id: 'clickjacking',
      label: 'Clickjacking protection (X-Frame-Options / frame-ancestors)',
      pass: Boolean(xfo) || /frame-ancestors/i.test(csp ?? ''),
      detail: xfo,
    },
    { id: 'nosniff', label: 'X-Content-Type-Options: nosniff', pass: /nosniff/i.test(first(headers, 'x-content-type-options') ?? '') },
    { id: 'referrer', label: 'Referrer-Policy', pass: Boolean(first(headers, 'referrer-policy')), detail: first(headers, 'referrer-policy') },
    { id: 'permissions', label: 'Permissions-Policy', pass: Boolean(first(headers, 'permissions-policy')) },
  ];

  const exposedVersions: string[] = [];
  for (const k of ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-generator']) {
    for (const v of headers[k] ?? []) if (/\d/.test(v)) exposedVersions.push(`${k}: ${v}`);
  }
  checks.push({
    id: 'versions',
    label: 'Server software versions hidden',
    pass: exposedVersions.length === 0,
    detail: exposedVersions.join(', ') || undefined,
  });

  const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
  return { https, httpRedirectsToHttps, checks, score, exposedVersions };
}
