import type { PerfInfo } from '../../../../shared/report.js';
import type { Collected } from '../collected.js';
import { registrableDomain } from './dns.js';

export function summarizePerformance(c: Collected): PerfInfo | undefined {
  if (c.mode !== 'browser' || !c.requests.length) return undefined;
  const site = registrableDomain(new URL(c.finalUrl).hostname);
  const byType = new Map<string, { requests: number; bytes: number }>();
  const thirdParty = new Map<string, number>();
  let totalBytes = 0;

  for (const r of c.requests) {
    totalBytes += r.bytes;
    const t = byType.get(r.type) ?? { requests: 0, bytes: 0 };
    t.requests++;
    t.bytes += r.bytes;
    byType.set(r.type, t);
    try {
      const host = new URL(r.url).hostname;
      if (registrableDomain(host) !== site) thirdParty.set(host, (thirdParty.get(host) ?? 0) + 1);
    } catch {
      /* data: URLs etc. */
    }
  }

  return {
    requests: c.requests.length,
    totalBytes,
    byType: [...byType.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.bytes - a.bytes),
    largest: [...c.requests]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 6)
      .map(({ url, type, bytes }) => ({ url, type, bytes })),
    thirdPartyRequests: [...thirdParty.values()].reduce((a, b) => a + b, 0),
    thirdPartyHosts: [...thirdParty.entries()]
      .map(([host, requests]) => ({ host, requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 15),
    domContentLoadedMs: c.timings?.domContentLoadedMs,
    loadMs: c.timings?.loadMs,
    htmlBytes: c.htmlBytes,
  };
}
