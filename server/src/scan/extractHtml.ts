import * as cheerio from 'cheerio';
import type { SeoInfo } from '../../../shared/report.js';
import type { DomFinding } from './matcher.js';

export interface HtmlExtract {
  meta: Record<string, string[]>;
  scriptSrc: string[];
  inlineScripts: string;
  stylesheets: string[];
  resourceUrls: string[];
  seo: SeoInfo;
  $: cheerio.CheerioAPI;
}

const MAX_INLINE_SCRIPTS = 400_000;

function abs(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

export function extractFromHtml(html: string, baseUrl: string, visibleText?: string): HtmlExtract {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);

  const meta: Record<string, string[]> = {};
  $('meta').each((_, el) => {
    const name = ($(el).attr('name') ?? $(el).attr('property') ?? $(el).attr('http-equiv') ?? $(el).attr('itemprop'))?.toLowerCase();
    const content = $(el).attr('content');
    if (name && content !== undefined) (meta[name] ??= []).push(content);
  });

  const scriptSrc: string[] = [];
  let inlineScripts = '';
  $('script').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      const u = abs(src, baseUrl);
      if (u) scriptSrc.push(u);
    } else if (inlineScripts.length < MAX_INLINE_SCRIPTS) {
      const type = ($(el).attr('type') ?? '').toLowerCase();
      if (!type || type.includes('javascript') || type === 'module') inlineScripts += `${$(el).text()}\n`;
    }
  });

  const stylesheets = $('link[rel~="stylesheet"]')
    .map((_, el) => abs($(el).attr('href'), baseUrl))
    .get()
    .filter(Boolean) as string[];

  const resourceUrls = [
    ...scriptSrc,
    ...stylesheets,
    ...($('img[src], link[href], source[src], iframe[src]')
      .map((_, el) => abs($(el).attr('src') ?? $(el).attr('href'), baseUrl))
      .get()
      .filter(Boolean) as string[]),
  ];

  let internalLinks = 0;
  let externalLinks = 0;
  const siteRoot = base.hostname.replace(/^www\./, '');
  $('a[href]').each((_, el) => {
    const u = abs($(el).attr('href'), baseUrl);
    if (!u || !u.startsWith('http')) return;
    const h = new URL(u).hostname.replace(/^www\./, '');
    if (h === siteRoot || h.endsWith(`.${siteRoot}`)) internalLinks++;
    else externalLinks++;
  });

  const structuredData = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const walk = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (n['@type']) [].concat(n['@type']).forEach((t: string) => structuredData.add(String(t)));
        if (n['@graph']) walk(n['@graph']);
      };
      walk(data);
    } catch {
      /* invalid JSON-LD */
    }
  });

  const text = visibleText ?? $('body').text();
  const title = $('title').first().text().trim() || undefined;
  const description = meta['description']?.[0]?.trim() || undefined;
  const images = $('img');

  const seo: SeoInfo = {
    title,
    titleLength: title?.length ?? 0,
    description,
    descriptionLength: description?.length ?? 0,
    canonical: abs($('link[rel="canonical"]').attr('href'), baseUrl),
    lang: $('html').attr('lang') || undefined,
    h1: $('h1')
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean)
      .slice(0, 5),
    ogTitle: meta['og:title']?.[0],
    ogImage: meta['og:image']?.[0],
    twitterCard: meta['twitter:card']?.[0],
    favicon: abs($('link[rel~="icon"]').first().attr('href'), baseUrl),
    viewport: Boolean(meta['viewport']?.length),
    robotsMeta: meta['robots']?.[0],
    hreflangs: $('link[rel="alternate"][hreflang]')
      .map((_, el) => $(el).attr('hreflang'))
      .get()
      .filter(Boolean)
      .slice(0, 50),
    structuredData: [...structuredData].slice(0, 20),
    wordCount: text.split(/\s+/).filter((w) => /\w/.test(w)).length,
    images: images.length,
    imagesMissingAlt: images.filter((_, el) => !($(el).attr('alt') ?? '').trim()).length,
    internalLinks,
    externalLinks,
    forms: $('form').length,
    iframes: [
      ...new Set(
        $('iframe[src]')
          .map((_, el) => {
            const u = abs($(el).attr('src'), baseUrl);
            return u ? new URL(u).hostname : undefined;
          })
          .get()
          .filter(Boolean) as string[],
      ),
    ].slice(0, 20),
  };

  return { meta, scriptSrc: [...new Set(scriptSrc)], inlineScripts, stylesheets, resourceUrls, seo, $ };
}

/** DOM checks without a browser (fetch mode): supports exists/text/attributes, not JS properties. */
export function runDomChecksStatic(
  $: cheerio.CheerioAPI,
  checks: [number, string, { text?: boolean; attributes?: string[]; properties?: string[] }][],
): Map<number, DomFinding[]> {
  const out = new Map<number, DomFinding[]>();
  for (const [techIndex, selector, spec] of checks) {
    let nodes;
    try {
      nodes = $(selector).slice(0, 10);
    } catch {
      continue; // selector cheerio doesn't support
    }
    if (!nodes.length) continue;
    const list = out.get(techIndex) ?? [];
    list.push({ selector, kind: 'exists', key: '', value: '' });
    nodes.each((_, el) => {
      if (spec.text) list.push({ selector, kind: 'text', key: '', value: $(el).text().slice(0, 500) });
      for (const a of spec.attributes ?? []) {
        const v = $(el).attr(a);
        if (v !== undefined) list.push({ selector, kind: 'attributes', key: a, value: v.slice(0, 500) });
      }
    });
    out.set(techIndex, list);
  }
  return out;
}
