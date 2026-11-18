import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Category } from '../../../shared/report.js';
import { FINGERPRINTS_DIR } from '../paths.js';
import { parsePatternMap, parsePatterns, type Pattern } from './patterns.js';

export interface DomCheck {
  selector: string;
  exists?: Pattern;
  text?: Pattern;
  attributes?: Map<string, Pattern[]>;
  properties?: Map<string, Pattern[]>;
}

export interface Relation {
  name: string;
  confidence: number;
}

export interface Technology {
  index: number;
  name: string;
  slug: string;
  description?: string;
  website?: string;
  icon?: string;
  cats: number[];
  saas?: boolean;
  oss?: boolean;
  pricing?: string[];
  url: Pattern[];
  html: Pattern[];
  text: Pattern[];
  css: Pattern[];
  robots: Pattern[];
  certIssuer: Pattern[];
  scriptSrc: Pattern[];
  scripts: Pattern[];
  xhr: Pattern[];
  headers: Map<string, Pattern[]>;
  cookies: Map<string, Pattern[]>;
  meta: Map<string, Pattern[]>;
  dns: Map<string, Pattern[]>;
  /** JS global paths (case-sensitive), e.g. "jQuery.fn.jquery" */
  js: Map<string, Pattern[]>;
  dom: DomCheck[];
  implies: Relation[];
  requires: string[];
  requiresCategory: number[];
  excludes: string[];
}

export interface Fingerprints {
  technologies: Technology[];
  byName: Map<string, Technology>;
  categories: Map<number, Category>;
  iconBase: string;
  sha: string;
}

const toArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseRelations(raw: unknown): Relation[] {
  return toArray(raw as string | string[]).map((s) => {
    const [name, ...attrs] = String(s).split('\\;');
    const conf = attrs.find((a) => a.startsWith('confidence:'));
    return { name, confidence: conf ? Number.parseInt(conf.split(':')[1], 10) || 100 : 100 };
  });
}

function parseDom(raw: unknown): DomCheck[] {
  if (!raw) return [];
  if (typeof raw === 'string' || Array.isArray(raw)) {
    return toArray(raw as string | string[]).map((selector) => ({ selector, exists: parsePatterns('')[0] }));
  }
  const checks: DomCheck[] = [];
  for (const [selector, spec] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    const c: DomCheck = { selector };
    if (spec && typeof spec === 'object') {
      if ('exists' in spec) c.exists = parsePatterns(spec.exists)[0] ?? parsePatterns('')[0];
      if ('text' in spec) c.text = parsePatterns(spec.text)[0];
      if (spec.attributes) c.attributes = parsePatternMap(spec.attributes, true);
      if (spec.properties) c.properties = parsePatternMap(spec.properties, true);
    }
    if (!c.exists && !c.text && !c.attributes && !c.properties) c.exists = parsePatterns('')[0];
    checks.push(c);
  }
  return checks;
}

export function compileTechnology(name: string, t: Record<string, any>, index: number): Technology {
  return {
    index,
    name,
    slug: slugify(name),
    description: t.description,
    website: t.website,
    icon: t.icon,
    cats: toArray(t.cats).map(Number),
    saas: t.saas,
    oss: t.oss,
    pricing: t.pricing,
    url: parsePatterns(t.url),
    html: parsePatterns(t.html),
    text: parsePatterns(t.text),
    css: parsePatterns(t.css),
    robots: parsePatterns(t.robots),
    certIssuer: parsePatterns(t.certIssuer),
    scriptSrc: parsePatterns(t.scriptSrc),
    scripts: parsePatterns(t.scripts),
    xhr: parsePatterns(t.xhr),
    headers: parsePatternMap(t.headers),
    cookies: parsePatternMap(t.cookies),
    meta: parsePatternMap(t.meta),
    dns: parsePatternMap(t.dns, true),
    js: parsePatternMap(t.js, true),
    dom: parseDom(t.dom),
    implies: parseRelations(t.implies),
    requires: parseRelations(t.requires).map((r) => r.name),
    requiresCategory: toArray(t.requiresCategory).map(Number),
    excludes: parseRelations(t.excludes).map((r) => r.name),
  };
}

export function buildFingerprints(
  techJson: Record<string, Record<string, any>>,
  categoriesJson: Record<string, { name: string; priority: number }>,
  meta: { iconBase?: string; sha?: string } = {},
): Fingerprints {
  const technologies = Object.entries(techJson).map(([name, t], i) => compileTechnology(name, t, i));
  const categories = new Map<number, Category>();
  for (const [id, c] of Object.entries(categoriesJson)) {
    categories.set(Number(id), { id: Number(id), name: c.name, priority: c.priority });
  }
  return {
    technologies,
    byName: new Map(technologies.map((t) => [t.name, t])),
    categories,
    iconBase: meta.iconBase ?? '',
    sha: meta.sha ?? 'unknown',
  };
}

let cached: Fingerprints | null = null;

export function loadFingerprints(): Fingerprints {
  if (cached) return cached;
  const dir = FINGERPRINTS_DIR;
  const techDir = path.join(dir, 'technologies');
  if (!existsSync(techDir)) {
    throw new Error('Fingerprint data missing. Run `npm run fingerprints` from the project root.');
  }
  const techJson: Record<string, Record<string, any>> = {};
  for (const file of readdirSync(techDir).filter((f) => f.endsWith('.json'))) {
    Object.assign(techJson, JSON.parse(readFileSync(path.join(techDir, file), 'utf8')));
  }
  const categoriesJson = JSON.parse(readFileSync(path.join(dir, 'categories.json'), 'utf8'));
  const meta = existsSync(path.join(dir, 'meta.json'))
    ? JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8'))
    : {};
  cached = buildFingerprints(techJson, categoriesJson, meta);
  return cached;
}
