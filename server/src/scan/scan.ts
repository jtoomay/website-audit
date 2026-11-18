/**
 * Framework-agnostic scanner: scanUrl(url) → ScanReport.
 * Used by the Express API, the CLI, and (later) any serverless wrapper.
 */
import type { ScanReport } from '../../../shared/report.js';
import { collectWithBrowser } from './browser.js';
import type { Collected } from './collected.js';
import { extractFromHtml } from './extractHtml.js';
import { probeDns } from './extras/dns.js';
import { summarizePerformance } from './extras/perf.js';
import { checkSecurity } from './extras/security.js';
import { extractShopify } from './extras/shopify.js';
import { probeSitemap } from './extras/sitemap.js';
import { probeTls } from './extras/tls.js';
import { probeWordPress } from './extras/wordpress.js';
import { collectWithFetch } from './fetchMode.js';
import { loadFingerprints } from './fingerprints.js';
import { buildInsights, primaryStack } from './insights.js';
import { emptySignals, matchTechnologies, resolveTechnologies } from './matcher.js';
import { assertPublicHost, normalizeUrl, ScanError } from './urlGuard.js';

export interface ScanOptions {
  /** 'auto' tries the headless browser and falls back to fetch. */
  mode?: 'auto' | 'browser' | 'fetch';
  onProgress?: (step: string) => void;
}

export interface ScanResult {
  report: ScanReport;
  screenshot?: Buffer;
}

export async function scanUrl(input: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const started = Date.now();
  const progress = opts.onProgress ?? (() => {});
  const target = normalizeUrl(input);
  await assertPublicHost(target.hostname);
  const fp = loadFingerprints();

  // 1. Load the page
  progress('Loading page');
  let collected: Collected;
  const mode = opts.mode ?? 'auto';
  if (mode === 'fetch') {
    collected = await collectWithFetch(target, fp);
  } else {
    try {
      collected = await collectWithBrowser(target, fp);
    } catch (err) {
      if (err instanceof ScanError || mode === 'browser') throw err;
      // Browser couldn't start (e.g. Chromium not installed): degrade to fetch mode
      console.warn('[scan] browser unavailable, falling back to fetch mode:', (err as Error).message);
      collected = await collectWithFetch(target, fp);
    }
  }

  const final = new URL(collected.finalUrl);
  const origin = final.origin;
  const html = extractFromHtml(collected.html, collected.finalUrl, collected.visibleText);

  // 2. Network-level probes run in parallel
  progress('Checking DNS, SSL and sitemap');
  const [dnsResult, tls, sitemapResult, security] = await Promise.all([
    probeDns(final.hostname).catch(() => undefined),
    final.protocol === 'https:' ? probeTls(final.hostname) : Promise.resolve(undefined),
    probeSitemap(origin).catch(() => undefined),
    checkSecurity(collected.finalUrl, collected.headers),
  ]);

  // 3. Fingerprint matching
  progress('Matching technologies');
  const signals = emptySignals(collected.finalUrl);
  signals.html = collected.html;
  signals.text = collected.visibleText ?? '';
  signals.css = collected.css;
  signals.robots = sitemapResult?.robots ?? '';
  signals.certIssuer = tls?.issuer ?? '';
  signals.scriptSrc = [
    ...new Set([...html.scriptSrc, ...collected.requests.filter((r) => r.type === 'script').map((r) => r.url)]),
  ];
  signals.scripts = html.inlineScripts;
  signals.xhr = [
    ...new Set(
      collected.requests
        .filter((r) => r.type === 'xhr' || r.type === 'fetch')
        .map((r) => {
          try {
            return new URL(r.url).hostname;
          } catch {
            return '';
          }
        })
        .filter(Boolean),
    ),
  ];
  signals.headers = collected.headers;
  signals.cookies = collected.cookies;
  signals.meta = html.meta;
  signals.dns = dnsResult?.records ?? {};
  signals.js = collected.js;
  signals.dom = collected.dom;

  const technologies = resolveTechnologies(fp, matchTechnologies(fp, signals));

  // 4. Platform-specific deep dives
  progress('Inspecting platform details');
  const wpTech = technologies.find((t) => t.name === 'WordPress');
  const wordpress = wpTech
    ? await probeWordPress({
        origin,
        html: collected.html,
        urls: [...collected.requests.map((r) => r.url), ...html.resourceUrls],
        detectedVersion: wpTech.version,
      }).catch(() => undefined)
    : undefined;
  // Merge in plugins the fingerprints recognised (category 87 = WordPress plugins), e.g. Yoast via meta tags
  if (wordpress) {
    const known = new Set(wordpress.plugins.map((p) => p.name.toLowerCase()));
    for (const t of technologies.filter((t) => t.categories.some((c) => c.id === 87))) {
      if (!known.has(t.name.toLowerCase())) {
        wordpress.plugins.push({ slug: t.slug, name: t.name, version: t.version, source: 'assets' });
        known.add(t.name.toLowerCase());
      }
    }
    wordpress.plugins.sort((a, b) => a.name.localeCompare(b.name));
  }
  const shopify = technologies.some((t) => t.name === 'Shopify')
    ? extractShopify(collected.shopifyGlobal, collected.html)
    : undefined;

  const draft = {
    requestedUrl: target.toString(),
    finalUrl: collected.finalUrl,
    status: collected.status,
    redirects: collected.redirects,
    scannedAt: new Date(started).toISOString(),
    durationMs: 0,
    mode: collected.mode,
    partial: collected.mode === 'fetch',
    warnings: collected.warnings,
    technologies,
    wordpress,
    shopify,
    sitemap: sitemapResult?.info,
    dns: dnsResult?.info,
    tls,
    security,
    seo: html.seo,
    performance: summarizePerformance(collected),
    fingerprintsVersion: fp.sha.slice(0, 10),
  };
  if (collected.status >= 400) draft.warnings.push(`The site responded with HTTP ${collected.status}; results may reflect an error or bot-protection page.`);
  if (technologies.length === 0) draft.warnings.push('No technologies detected. The site may block automated visitors.');

  const { insights, complexity } = buildInsights(draft);
  const report: ScanReport = {
    ...draft,
    primaryStack: primaryStack(technologies),
    insights,
    complexity,
    durationMs: Date.now() - started,
  };
  return { report, screenshot: collected.screenshot };
}
