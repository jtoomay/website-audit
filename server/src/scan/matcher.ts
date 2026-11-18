import type { Category, DetectedTech, Evidence } from '../../../shared/report.js';
import type { Fingerprints, Technology } from './fingerprints.js';
import { testPattern, type Pattern } from './patterns.js';

/** Everything collected from a page that fingerprints can match against. */
export interface Signals {
  url: string;
  html: string;
  text: string;
  css: string;
  robots: string;
  certIssuer: string;
  scriptSrc: string[];
  scripts: string;
  /** Hostnames of XHR/fetch requests the page made. */
  xhr: string[];
  /** Lower-cased header name → values */
  headers: Record<string, string[]>;
  /** Lower-cased cookie name → values */
  cookies: Record<string, string[]>;
  /** Lower-cased meta name/property → contents */
  meta: Record<string, string[]>;
  /** DNS record type (TXT, MX, NS, SOA, CNAME) → values */
  dns: Record<string, string[]>;
  /** Results of evaluating JS globals in the page: techIndex → path → stringified value */
  js: Map<number, Map<string, string>>;
  /** Results of DOM selector checks: techIndex → findings */
  dom: Map<number, DomFinding[]>;
}

export interface DomFinding {
  selector: string;
  kind: 'exists' | 'text' | 'attributes' | 'properties';
  key: string;
  value: string;
}

export function emptySignals(url: string): Signals {
  return {
    url,
    html: '',
    text: '',
    css: '',
    robots: '',
    certIssuer: '',
    scriptSrc: [],
    scripts: '',
    xhr: [],
    headers: {},
    cookies: {},
    meta: {},
    dns: {},
    js: new Map(),
    dom: new Map(),
  };
}

interface Hit {
  confidence: number;
  version: string;
  evidence: Evidence;
}

const snippet = (s: string, max = 120) => (s.length > max ? `${s.slice(0, max)}…` : s);

function matchList(patterns: Pattern[], values: string[], type: string, hits: Hit[], key?: string) {
  for (const p of patterns) {
    for (const value of values) {
      const version = testPattern(p, value);
      if (version !== null) {
        const m = p.source ? p.regex.exec(value)?.[0] ?? value : value;
        hits.push({ confidence: p.confidence, version, evidence: { type, key, match: snippet(m || value) } });
        break; // one hit per pattern is enough
      }
    }
  }
}

function matchMap(map: Map<string, Pattern[]>, data: Record<string, string[]>, type: string, hits: Hit[]) {
  for (const [key, patterns] of map) {
    const values = data[key];
    if (!values?.length) continue;
    matchList(patterns, values, type, hits, key);
  }
}

/** Run every fingerprint against the signals. Returns raw (pre-implication) detections. */
export function matchTechnologies(fp: Fingerprints, s: Signals): Map<string, { tech: Technology; hits: Hit[] }> {
  const found = new Map<string, { tech: Technology; hits: Hit[] }>();
  const scriptSrc = s.scriptSrc;
  const xhr = s.xhr;

  for (const tech of fp.technologies) {
    const hits: Hit[] = [];
    if (tech.url.length) matchList(tech.url, [s.url], 'url', hits);
    if (tech.html.length && s.html) matchList(tech.html, [s.html], 'html', hits);
    if (tech.text.length && s.text) matchList(tech.text, [s.text], 'text', hits);
    if (tech.css.length && s.css) matchList(tech.css, [s.css], 'css', hits);
    if (tech.robots.length && s.robots) matchList(tech.robots, [s.robots], 'robots', hits);
    if (tech.certIssuer.length && s.certIssuer) matchList(tech.certIssuer, [s.certIssuer], 'certIssuer', hits);
    if (tech.scriptSrc.length && scriptSrc.length) matchList(tech.scriptSrc, scriptSrc, 'scriptSrc', hits);
    if (tech.scripts.length && s.scripts) matchList(tech.scripts, [s.scripts], 'scripts', hits);
    if (tech.xhr.length && xhr.length) matchList(tech.xhr, xhr, 'xhr', hits);
    if (tech.headers.size) matchMap(tech.headers, s.headers, 'headers', hits);
    if (tech.cookies.size) matchMap(tech.cookies, s.cookies, 'cookies', hits);
    if (tech.meta.size) matchMap(tech.meta, s.meta, 'meta', hits);
    if (tech.dns.size) matchMap(tech.dns, s.dns, 'dns', hits);

    if (tech.js.size) {
      const values = s.js.get(tech.index);
      if (values) {
        for (const [path, patterns] of tech.js) {
          const v = values.get(path);
          if (v === undefined) continue;
          matchList(patterns, [v], 'js', hits, path);
        }
      }
    }

    if (tech.dom.length) {
      const findings = s.dom.get(tech.index);
      if (findings) {
        for (const check of tech.dom) {
          for (const f of findings.filter((x) => x.selector === check.selector)) {
            let p: Pattern | undefined;
            if (f.kind === 'exists') p = check.exists;
            else if (f.kind === 'text') p = check.text;
            else if (f.kind === 'attributes') p = check.attributes?.get(f.key)?.[0];
            else if (f.kind === 'properties') p = check.properties?.get(f.key)?.[0];
            if (!p) continue;
            const version = testPattern(p, f.value);
            if (version !== null) {
              hits.push({
                confidence: p.confidence,
                version,
                evidence: { type: 'dom', key: f.key ? `${check.selector} [${f.key}]` : check.selector, match: snippet(f.value || 'element present') },
              });
              break;
            }
          }
        }
      }
    }

    if (hits.length) found.set(tech.name, { tech, hits });
  }
  return found;
}

function pickVersion(versions: string[]): string | undefined {
  const real = versions.filter((v) => v && /\d/.test(v));
  if (!real.length) return undefined;
  const counts = new Map<string, number>();
  for (const v of real) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Prefer most frequent, then most specific (longest)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
}

/**
 * Apply implies / excludes / requires / requiresCategory and produce the final list.
 */
export function resolveTechnologies(
  fp: Fingerprints,
  raw: Map<string, { tech: Technology; hits: Hit[] }>,
): DetectedTech[] {
  interface Entry {
    tech: Technology;
    confidence: number;
    versions: string[];
    evidence: Evidence[];
    impliedBy: Set<string>;
  }
  const entries = new Map<string, Entry>();
  for (const [name, { tech, hits }] of raw) {
    entries.set(name, {
      tech,
      confidence: Math.min(100, hits.reduce((sum, h) => sum + h.confidence, 0)),
      versions: hits.map((h) => h.version),
      evidence: hits.map((h) => h.evidence).slice(0, 8),
      impliedBy: new Set(),
    });
  }

  // implies (transitive)
  const queue = [...entries.keys()];
  const seen = new Set<string>();
  while (queue.length) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const e = entries.get(name);
    if (!e) continue;
    for (const rel of e.tech.implies) {
      const target = fp.byName.get(rel.name);
      if (!target) continue;
      const conf = Math.min(e.confidence, rel.confidence);
      const existing = entries.get(rel.name);
      if (existing) {
        existing.impliedBy.add(name);
        existing.confidence = Math.max(existing.confidence, conf);
      } else {
        entries.set(rel.name, {
          tech: target,
          confidence: conf,
          versions: [],
          evidence: [{ type: 'implied', match: `Implied by ${name}` }],
          impliedBy: new Set([name]),
        });
        queue.push(rel.name);
      }
    }
  }

  // excludes
  for (const e of [...entries.values()]) {
    for (const ex of e.tech.excludes) entries.delete(ex);
  }

  // requires / requiresCategory: iterate until stable
  for (let changed = true, i = 0; changed && i < 5; i++) {
    changed = false;
    const presentCats = new Set([...entries.values()].flatMap((e) => e.tech.cats));
    for (const [name, e] of entries) {
      const missingReq = e.tech.requires.some((r) => !entries.has(r));
      const missingCat = e.tech.requiresCategory.length > 0 && !e.tech.requiresCategory.some((c) => presentCats.has(c));
      if (missingReq || missingCat) {
        entries.delete(name);
        changed = true;
      }
    }
  }

  const result: DetectedTech[] = [];
  for (const e of entries.values()) {
    if (e.confidence <= 0) continue;
    const categories = e.tech.cats
      .map((c) => fp.categories.get(c))
      .filter((c): c is Category => Boolean(c))
      .sort((a, b) => a.priority - b.priority);
    result.push({
      name: e.tech.name,
      slug: e.tech.slug,
      description: e.tech.description,
      website: e.tech.website,
      iconUrl: e.tech.icon && fp.iconBase ? fp.iconBase + encodeURIComponent(e.tech.icon) : undefined,
      version: pickVersion(e.versions),
      confidence: e.confidence,
      categories,
      saas: e.tech.saas,
      oss: e.tech.oss,
      pricing: e.tech.pricing,
      impliedBy: e.impliedBy.size ? [...e.impliedBy] : undefined,
      evidence: e.evidence,
    });
  }
  return result.sort(
    (a, b) =>
      (a.categories[0]?.priority ?? 99) - (b.categories[0]?.priority ?? 99) ||
      b.confidence - a.confidence ||
      a.name.localeCompare(b.name),
  );
}

/** Compact lists of the JS/DOM checks to run inside the browser. */
export function buildBrowserChecks(fp: Fingerprints) {
  const js: [number, string][] = [];
  const dom: [number, string, { text?: boolean; attributes?: string[]; properties?: string[] }][] = [];
  for (const t of fp.technologies) {
    for (const path of t.js.keys()) js.push([t.index, path]);
    for (const d of t.dom) {
      dom.push([
        t.index,
        d.selector,
        {
          text: d.text ? true : undefined,
          attributes: d.attributes ? [...d.attributes.keys()] : undefined,
          properties: d.properties ? [...d.properties.keys()] : undefined,
        },
      ]);
    }
  }
  return { js, dom };
}
