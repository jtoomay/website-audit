import { chromium, type Browser, type Request } from 'playwright';
import type { Fingerprints } from './fingerprints.js';
import { buildBrowserChecks, type DomFinding } from './matcher.js';
import { addMulti, type Collected, type RequestRecord } from './collected.js';
import { assertPublicHost, ScanError } from './urlGuard.js';
import { USER_AGENT } from './safeFetch.js';

let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
      browserPromise = null;
      throw err;
    });
    const b = await browserPromise;
    b.on('disconnected', () => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close().catch(() => {});
  }
}

/**
 * Code evaluated inside the target page. Kept as a plain string so the TypeScript
 * toolchain can't inject helpers that don't exist in the page context.
 */
const IN_PAGE_SCRIPT = String.raw`(args) => {
  const out = { js: [], dom: [], css: '', text: '', timings: {}, shopify: null };

  for (const [ti, path] of args.js) {
    try {
      let v = window;
      for (const part of path.split('.')) {
        if (v === null || v === undefined) { v = undefined; break; }
        v = v[part];
      }
      if (v !== undefined && v !== null) {
        const t = typeof v;
        out.js.push([ti, path, (t === 'string' || t === 'number' || t === 'boolean') ? String(v).slice(0, 300) : '']);
      }
    } catch (e) {}
  }

  for (const [ti, selector, spec] of args.dom) {
    let nodes;
    try { nodes = Array.from(document.querySelectorAll(selector)).slice(0, 10); } catch (e) { continue; }
    if (!nodes.length) continue;
    out.dom.push([ti, selector, 'exists', '', '']);
    for (const n of nodes) {
      if (spec.text) out.dom.push([ti, selector, 'text', '', (n.textContent || '').slice(0, 500)]);
      for (const a of spec.attributes || []) {
        const v = n.getAttribute(a);
        if (v !== null) out.dom.push([ti, selector, 'attributes', a, v.slice(0, 500)]);
      }
      for (const p of spec.properties || []) {
        try {
          const v = n[p];
          if (v !== undefined && v !== null) {
            const t = typeof v;
            out.dom.push([ti, selector, 'properties', p, (t === 'string' || t === 'number' || t === 'boolean') ? String(v).slice(0, 300) : '']);
          }
        } catch (e) {}
      }
    }
  }

  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    if (css.length > 300000) break;
    try { for (const r of Array.from(sheet.cssRules)) { css += r.cssText + '\n'; if (css.length > 300000) break; } } catch (e) {}
  }
  out.css = css;
  out.text = (document.body && document.body.innerText || '').slice(0, 200000);

  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) out.timings = { domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd), loadMs: Math.round(nav.loadEventEnd) || undefined };

  try {
    const S = window.Shopify;
    if (S && typeof S === 'object') {
      out.shopify = {
        shop: S.shop,
        theme: S.theme ? { name: S.theme.name, id: S.theme.id, theme_store_id: S.theme.theme_store_id, schema_name: S.theme.schema_name } : null,
        currency: S.currency && S.currency.active,
        country: S.country,
      };
    }
  } catch (e) {}
  return out;
}`;

const MAX_HTML = 1_500_000;

export async function collectWithBrowser(target: URL, fp: Fingerprints): Promise<Collected> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 800 },
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    locale: 'en-US',
  });
  const warnings: string[] = [];
  const requests: RequestRecord[] = [];
  const xhrRequests: string[] = [];

  try {
    // Block any request (including redirects and sub-resources) to private networks.
    await context.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return route.continue();
      try {
        await assertPublicHost(u.hostname);
        await route.continue();
      } catch {
        await route.abort('blockedbyclient').catch(() => {});
      }
    });

    const page = await context.newPage();
    page.on('requestfinished', async (req: Request) => {
      const type = req.resourceType();
      const sizes = await req.sizes().catch(() => null);
      const resp = await req.response().catch(() => null);
      requests.push({ url: req.url(), type, status: resp?.status(), bytes: sizes ? sizes.responseBodySize : 0 });
      if (type === 'xhr' || type === 'fetch') xhrRequests.push(req.url());
    });

    let response;
    try {
      response = await page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 25_000 });
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (/timeout/i.test(msg)) throw new ScanError('The site took too long to respond (25s).', 'timeout');
      if (/ERR_NAME_NOT_RESOLVED/.test(msg)) throw new ScanError(`Couldn't find the website "${target.hostname}".`, 'unreachable');
      if (/ERR_BLOCKED_BY_CLIENT/.test(msg)) throw new ScanError('This site redirects to a private network address, which is not allowed.', 'blocked');
      throw new ScanError(`Couldn't load the site: ${msg.split('\n')[0]}`, 'unreachable');
    }
    if (!response) throw new ScanError('The site returned no response.', 'unreachable');

    // Let lazy scripts, tag managers and chat widgets load.
    await page.waitForLoadState('networkidle', { timeout: 7_000 }).catch(() => warnings.push('Page kept loading resources; results may miss late-loading scripts.'));
    await page.waitForTimeout(1200);

    const redirects: string[] = [];
    for (let r = response.request().redirectedFrom(); r; r = r.redirectedFrom()) redirects.unshift(r.url());

    const headers: Record<string, string[]> = {};
    for (const h of await response.headersArray()) addMulti(headers, h.name, h.value);

    const cookies: Record<string, string[]> = {};
    for (const c of await context.cookies()) addMulti(cookies, c.name, c.value);

    let html = await page.content();
    const htmlBytes = Buffer.byteLength(html);
    if (html.length > MAX_HTML) html = html.slice(0, MAX_HTML);

    const checks = buildBrowserChecks(fp);
    const pageData = (await page.evaluate(`(${IN_PAGE_SCRIPT})(${JSON.stringify(checks)})`)) as {
      js: [number, string, string][];
      dom: [number, string, DomFinding['kind'], string, string][];
      css: string;
      text: string;
      timings: { domContentLoadedMs?: number; loadMs?: number };
      shopify: Record<string, unknown> | null;
    };

    const js = new Map<number, Map<string, string>>();
    for (const [ti, path, value] of pageData.js) {
      if (!js.has(ti)) js.set(ti, new Map());
      js.get(ti)!.set(path, value);
    }
    const dom = new Map<number, DomFinding[]>();
    for (const [ti, selector, kind, key, value] of pageData.dom) {
      if (!dom.has(ti)) dom.set(ti, []);
      dom.get(ti)!.push({ selector, kind, key, value });
    }

    const screenshot = await page
      .screenshot({ type: 'jpeg', quality: 60, timeout: 8000 })
      .catch(() => undefined);

    return {
      mode: 'browser',
      finalUrl: page.url(),
      status: response.status(),
      redirects,
      headers,
      cookies,
      html,
      htmlBytes,
      visibleText: pageData.text,
      css: pageData.css,
      js,
      dom,
      requests,
      screenshot,
      timings: pageData.timings,
      shopifyGlobal: pageData.shopify ?? undefined,
      warnings,
    };
  } finally {
    await context.close().catch(() => {});
  }
}
