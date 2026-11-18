import dns from 'node:dns/promises';
import net from 'node:net';

export class ScanError extends Error {
  constructor(
    message: string,
    public code: 'invalid_url' | 'blocked' | 'unreachable' | 'timeout' | 'failed' = 'failed',
  ) {
    super(message);
  }
}

/** Accepts "example.com", "www.example.com/page", "https://…" and returns a normalized URL. */
export function normalizeUrl(input: string): URL {
  let raw = (input ?? '').trim();
  if (!raw) throw new ScanError('Please enter a website address.', 'invalid_url');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ScanError(`"${input}" is not a valid website address.`, 'invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ScanError('Only http:// and https:// addresses can be scanned.', 'invalid_url');
  }
  if (url.username || url.password) {
    throw new ScanError('Addresses with embedded credentials are not allowed.', 'invalid_url');
  }
  const host = url.hostname.toLowerCase();
  if (!net.isIP(host.replace(/^\[|\]$/g, '')) && !host.includes('.')) {
    throw new ScanError(`"${host}" doesn't look like a public domain.`, 'invalid_url');
  }
  url.hash = '';
  return url;
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

export function isPrivateIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIPv4(clean)) {
    const n = ipv4ToInt(clean);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(clean)) {
    if (clean === '::' || clean === '::1') return true;
    const mapped = clean.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    const first = Number.parseInt(clean.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    return false;
  }
  return true; // unknown format: treat as unsafe
}

const hostCache = new Map<string, { ok: boolean; at: number }>();
let allowPrivate = false;

export function setAllowPrivateTargets(v: boolean) {
  allowPrivate = v;
}

/** Throws ScanError('blocked') if the host resolves to a private/internal address. */
export async function assertPublicHost(hostname: string): Promise<void> {
  if (allowPrivate) return;
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new ScanError(`Scanning internal hosts (${host}) is not allowed.`, 'blocked');
  }
  const cached = hostCache.get(host);
  if (cached && Date.now() - cached.at < 5 * 60_000) {
    if (!cached.ok) throw new ScanError(`Scanning internal addresses (${host}) is not allowed.`, 'blocked');
    return;
  }
  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    addresses = [];
    for (let attempt = 0; attempt < 3 && !addresses.length; attempt++) {
      try {
        addresses = (await dns.lookup(host, { all: true })).map((a) => a.address);
      } catch (err: any) {
        // ENOTFOUND is definitive; anything else (EAI_AGAIN, timeouts) is worth retrying
        if (err?.code === 'ENOTFOUND' && attempt > 0) break;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    if (!addresses.length) {
      throw new ScanError(`Couldn't find the website "${host}". Check the spelling.`, 'unreachable');
    }
  }
  const ok = addresses.length > 0 && addresses.every((a) => !isPrivateIp(a));
  hostCache.set(host, { ok, at: Date.now() });
  if (hostCache.size > 5000) hostCache.clear();
  if (!ok) throw new ScanError(`Scanning internal addresses (${host}) is not allowed.`, 'blocked');
}
