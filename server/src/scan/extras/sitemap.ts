import { XMLParser } from 'fast-xml-parser';
import type { SitemapInfo } from '../../../../shared/report.js';
import { tryFetch } from '../safeFetch.js';

const MAX_CHILD_SITEMAPS = 40;
const MAX_URLS = 100_000;
const parser = new XMLParser({ ignoreAttributes: true, processEntities: false });

const toArray = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Guess a content type from a child sitemap's file name (works for Yoast, Rank Math, WP core, Shopify, Squarespace…). */
function typeFromSitemapUrl(u: string): string {
  const name = decodeURIComponent(new URL(u).pathname.split('/').pop() ?? '').toLowerCase();
  const rules: [RegExp, string][] = [
    [/product(?!_cat|-cat|_tag)/, 'Products'],
    [/collection|product[_-]cat|categor/, 'Categories / collections'],
    [/post(?!_tag)|blog|article|news/, 'Blog posts'],
    [/page/, 'Pages'],
    [/tag/, 'Tags'],
    [/author|user/, 'Authors'],
    [/event/, 'Events'],
    [/portfolio|project|case/, 'Portfolio / projects'],
    [/video/, 'Videos'],
    [/image/, 'Images'],
    [/local|location|store/, 'Locations'],
  ];
  for (const [re, label] of rules) if (re.test(name)) return label;
  return 'Other';
}

async function fetchXml(u: string): Promise<any | null> {
  const res = await tryFetch(u, { timeoutMs: 12_000, maxBytes: 15_000_000, accept: 'application/xml,text/xml,*/*' });
  if (!res || res.status !== 200 || !/<(urlset|sitemapindex)/i.test(res.text.slice(0, 2000))) return null;
  try {
    return parser.parse(res.text);
  } catch {
    return null;
  }
}

export async function probeSitemap(origin: string): Promise<{ info: SitemapInfo; robots: string }> {
  const robotsRes = await tryFetch(`${origin}/robots.txt`, { timeoutMs: 8000, maxBytes: 200_000, accept: 'text/plain' });
  const robots = robotsRes && robotsRes.status === 200 && !/<html/i.test(robotsRes.text.slice(0, 500)) ? robotsRes.text : '';

  const candidates = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  if (!candidates.length) {
    candidates.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`);
  }

  const info: SitemapInfo = { robotsTxt: Boolean(robots), sitemaps: [], totalUrls: 0, truncated: false, byType: [], topSections: [] };
  const byType = new Map<string, number>();
  const sections = new Map<string, number>();
  const seenSitemaps = new Set<string>();
  const urlSet = new Set<string>();

  const addUrls = (urls: string[], type: string) => {
    let added = 0;
    for (const u of urls) {
      if (urlSet.size >= MAX_URLS) {
        info.truncated = true;
        break;
      }
      if (urlSet.has(u)) continue;
      urlSet.add(u);
      added++;
      try {
        const seg = new URL(u).pathname.split('/').filter(Boolean)[0];
        const key = seg ? `/${seg}` : '/';
        sections.set(key, (sections.get(key) ?? 0) + 1);
      } catch {
        /* ignore bad URLs */
      }
    }
    byType.set(type, (byType.get(type) ?? 0) + added);
  };

  // Without robots.txt hints, try the common locations one at a time and keep the first that works.
  let roots = [...new Set(candidates)].slice(0, 5);
  if (!robots || !/^\s*sitemap:/im.test(robots)) {
    for (const c of roots) {
      if (await fetchXml(c)) {
        roots = [c];
        break;
      }
    }
  }
  const queue = roots;
  while (queue.length && seenSitemaps.size < MAX_CHILD_SITEMAPS && urlSet.size < MAX_URLS) {
    const batch = queue.splice(0, 5).filter((u) => !seenSitemaps.has(u));
    batch.forEach((u) => seenSitemaps.add(u));
    const docs = await Promise.all(batch.map(async (u) => ({ u, doc: await fetchXml(u) })));
    for (const { u, doc } of docs) {
      if (!doc) continue;
      if (doc.sitemapindex) {
        info.sitemaps.push(u);
        for (const s of toArray(doc.sitemapindex.sitemap)) {
          const loc = typeof s?.loc === 'string' ? s.loc.trim() : undefined;
          if (loc && !seenSitemaps.has(loc)) queue.push(loc);
        }
      } else if (doc.urlset) {
        info.sitemaps.push(u);
        const locs = toArray(doc.urlset.url)
          .map((x: any) => (typeof x?.loc === 'string' ? x.loc.trim() : ''))
          .filter(Boolean);
        addUrls(locs, typeFromSitemapUrl(u));
      }
    }
  }
  if (queue.length) info.truncated = true;

  info.totalUrls = urlSet.size;
  info.byType = [...byType.entries()].filter(([, c]) => c > 0).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  info.topSections = [...sections.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return { info, robots };
}
