import { describe, expect, it } from 'vitest';
import { buildFingerprints } from '../src/scan/fingerprints.js';
import { emptySignals, matchTechnologies, resolveTechnologies } from '../src/scan/matcher.js';
import { parsePattern, resolveVersion, testPattern } from '../src/scan/patterns.js';
import { isPrivateIp, normalizeUrl } from '../src/scan/urlGuard.js';
import { extractFromHtml, runDomChecksStatic } from '../src/scan/extractHtml.js';
import { buildBrowserChecks } from '../src/scan/matcher.js';

const categories = {
  1: { name: 'CMS', priority: 1 },
  6: { name: 'Ecommerce', priority: 1 },
  27: { name: 'Programming languages', priority: 5 },
  34: { name: 'Databases', priority: 5 },
  59: { name: 'JavaScript libraries', priority: 9 },
  22: { name: 'Web servers', priority: 8 },
};

const fp = buildFingerprints(
  {
    WordPress: {
      cats: [1],
      meta: { generator: '^WordPress(?: ([\\d.]+))?\\;version:\\1' },
      scriptSrc: ['/wp-(?:content|includes)/'],
      implies: ['PHP', 'MySQL'],
    },
    WooCommerce: {
      cats: [6],
      requires: ['WordPress'],
      js: { woocommerce_params: '' },
      meta: { generator: 'WooCommerce ([\\d.]+)\\;version:\\1' },
    },
    PHP: { cats: [27], headers: { 'X-Powered-By': '^php/?([\\d.]+)?\\;version:\\1' } },
    MySQL: { cats: [34] },
    jQuery: { cats: [59], js: { 'jQuery.fn.jquery': '([\\d.]+)\\;version:\\1' } },
    Nginx: { cats: [22], headers: { Server: 'nginx(?:/([\\d.]+))?\\;version:\\1' }, excludes: ['Apache'] },
    Apache: { cats: [22], headers: { Server: '(?:Apache(?:$|/([\\d.]+)|[^/-])|(?:^|\\b)HTTPD)\\;version:\\1' } },
    LowConf: { cats: [59], html: ['lowconf\\;confidence:50'] },
    DomTech: { cats: [59], dom: { '#app[data-v]': { attributes: { 'data-v': '(\\d+)\\;version:\\1' } } } },
  },
  categories,
  { iconBase: 'https://icons/', sha: 'test' },
);

describe('patterns', () => {
  it('parses version and confidence modifiers', () => {
    const p = parsePattern('foo ([\\d.]+)\\;version:\\1\\;confidence:40');
    expect(p.confidence).toBe(40);
    expect(testPattern(p, 'foo 1.2.3')).toBe('1.2.3');
    expect(testPattern(p, 'bar')).toBeNull();
  });

  it('resolves ternary versions', () => {
    const m = /(a)?b/.exec('ab')!;
    expect(resolveVersion('\\1?yes:no', m)).toBe('yes');
    const m2 = /(a)?b/.exec('b')!;
    expect(resolveVersion('\\1?yes:no', m2)).toBe('no');
  });

  it('never throws on regex syntax JS does not support', () => {
    const p = parsePattern('(?i)bad[');
    expect(testPattern(p, 'anything')).toBeNull();
  });
});

describe('matcher', () => {
  it('detects from meta + extracts version, applies implies', () => {
    const s = emptySignals('https://example.com/');
    s.meta = { generator: ['WordPress 6.6.2'] };
    const result = resolveTechnologies(fp, matchTechnologies(fp, s));
    const names = result.map((t) => t.name);
    expect(names).toContain('WordPress');
    expect(names).toContain('PHP');
    expect(names).toContain('MySQL');
    expect(result.find((t) => t.name === 'WordPress')?.version).toBe('6.6.2');
    expect(result.find((t) => t.name === 'PHP')?.impliedBy).toEqual(['WordPress']);
    expect(result.find((t) => t.name === 'WordPress')?.iconUrl).toBeUndefined();
  });

  it('drops technologies whose requirement is missing', () => {
    const s = emptySignals('https://example.com/');
    s.js = new Map([[fp.byName.get('WooCommerce')!.index, new Map([['woocommerce_params', '']])]]);
    expect(resolveTechnologies(fp, matchTechnologies(fp, s)).map((t) => t.name)).not.toContain('WooCommerce');

    s.scriptSrc = ['https://example.com/wp-content/themes/x/app.js'];
    expect(resolveTechnologies(fp, matchTechnologies(fp, s)).map((t) => t.name)).toContain('WooCommerce');
  });

  it('matches headers case-insensitively and reads versions', () => {
    const s = emptySignals('https://example.com/');
    s.headers = { server: ['nginx/1.25.3'], 'x-powered-by': ['PHP/8.2.1'] };
    const r = resolveTechnologies(fp, matchTechnologies(fp, s));
    expect(r.find((t) => t.name === 'Nginx')?.version).toBe('1.25.3');
    expect(r.find((t) => t.name === 'PHP')?.version).toBe('8.2.1');
  });

  it('applies excludes', () => {
    const s = emptySignals('https://example.com/');
    s.headers = { server: ['nginx Apache'] }; // both patterns match; Nginx excludes Apache
    const names = resolveTechnologies(fp, matchTechnologies(fp, s)).map((t) => t.name);
    expect(names).toContain('Nginx');
    expect(names).not.toContain('Apache');
  });

  it('respects confidence', () => {
    const s = emptySignals('https://example.com/');
    s.html = '<div>lowconf</div>';
    const t = resolveTechnologies(fp, matchTechnologies(fp, s)).find((x) => x.name === 'LowConf');
    expect(t?.confidence).toBe(50);
  });

  it('reads JS global versions', () => {
    const s = emptySignals('https://example.com/');
    s.js = new Map([[fp.byName.get('jQuery')!.index, new Map([['jQuery.fn.jquery', '3.7.1']])]]);
    expect(resolveTechnologies(fp, matchTechnologies(fp, s)).find((t) => t.name === 'jQuery')?.version).toBe('3.7.1');
  });

  it('runs static DOM checks with attribute versions', () => {
    const { $ } = extractFromHtml('<div id="app" data-v="3"></div>', 'https://example.com/');
    const s = emptySignals('https://example.com/');
    s.dom = runDomChecksStatic($, buildBrowserChecks(fp).dom);
    const t = resolveTechnologies(fp, matchTechnologies(fp, s)).find((x) => x.name === 'DomTech');
    expect(t?.version).toBe('3');
  });
});

describe('html extraction', () => {
  it('collects meta, scripts and SEO basics', () => {
    const html = `<html lang="en"><head><title>Hi</title>
      <meta name="generator" content="WordPress 6.5">
      <meta name="viewport" content="width=device-width">
      <script src="/wp-includes/js/jquery.js?ver=3.7.1"></script>
      <script>var x = 1;</script></head>
      <body><h1>Hello</h1><img src="a.png"><a href="/about">About</a><a href="https://other.com">x</a></body></html>`;
    const r = extractFromHtml(html, 'https://example.com/');
    expect(r.meta.generator).toEqual(['WordPress 6.5']);
    expect(r.scriptSrc[0]).toBe('https://example.com/wp-includes/js/jquery.js?ver=3.7.1');
    expect(r.inlineScripts).toContain('var x = 1');
    expect(r.seo.title).toBe('Hi');
    expect(r.seo.h1).toEqual(['Hello']);
    expect(r.seo.imagesMissingAlt).toBe(1);
    expect(r.seo.internalLinks).toBe(1);
    expect(r.seo.externalLinks).toBe(1);
  });
});

describe('url guard', () => {
  it('normalizes bare domains', () => {
    expect(normalizeUrl('example.com').toString()).toBe('https://example.com/');
    expect(normalizeUrl(' http://Example.com/page#x ').toString()).toBe('http://example.com/page');
  });

  it('rejects bad input', () => {
    expect(() => normalizeUrl('')).toThrow();
    expect(() => normalizeUrl('ftp://example.com')).toThrow();
    expect(() => normalizeUrl('intranet')).toThrow();
    expect(() => normalizeUrl('https://user:pw@example.com')).toThrow();
  });

  it('flags private IPs', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111', '172.32.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});
