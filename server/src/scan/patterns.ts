/**
 * Parser for the fingerprint pattern syntax:
 *   "regex\;version:\1\;confidence:50"
 * Version strings may use ternaries: "\1?5.0:4.0".
 */
export interface Pattern {
  source: string;
  regex: RegExp;
  version?: string;
  confidence: number;
}

const NEVER = /(?!)/;
const regexCache = new Map<string, RegExp>();

function compile(source: string): RegExp {
  let re = regexCache.get(source);
  if (re) return re;
  try {
    re = new RegExp(source, 'i');
  } catch {
    re = NEVER; // pattern uses syntax JS doesn't support: skip it rather than crash
  }
  regexCache.set(source, re);
  return re;
}

export function parsePattern(raw: unknown): Pattern {
  const str = typeof raw === 'string' ? raw : String(raw ?? '');
  const [value, ...attrs] = str.split('\\;');
  const p: Pattern = { source: value, regex: compile(value), confidence: 100 };
  for (const attr of attrs) {
    const idx = attr.indexOf(':');
    if (idx === -1) continue;
    const key = attr.slice(0, idx);
    const val = attr.slice(idx + 1);
    if (key === 'confidence') p.confidence = Number.parseInt(val, 10) || 0;
    else if (key === 'version') p.version = val;
  }
  return p;
}

export function parsePatterns(raw: unknown): Pattern[] {
  if (raw === undefined || raw === null) return [];
  return (Array.isArray(raw) ? raw : [raw]).map(parsePattern);
}

/** Patterns keyed by name (headers, cookies, meta, js, dns). Keys are lower-cased unless keepCase. */
export function parsePatternMap(raw: unknown, keepCase = false): Map<string, Pattern[]> {
  const map = new Map<string, Pattern[]>();
  if (!raw || typeof raw !== 'object') return map;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    map.set(keepCase ? k : k.toLowerCase(), parsePatterns(v));
  }
  return map;
}

/** Resolve a version template (e.g. "\1", "\1?5.x:4.x") against regex match groups. */
export function resolveVersion(template: string | undefined, match: RegExpExecArray): string {
  if (!template) return '';
  let version = template;
  match.forEach((group, i) => {
    const ternary = new RegExp(`\\\\${i}\\?([^:]+):(.*)$`).exec(version);
    if (ternary) version = version.replace(ternary[0], group ? ternary[1] : ternary[2]);
    version = version.replace(new RegExp(`\\\\${i}`, 'g'), group ?? '');
  });
  version = version.trim();
  // Discard junk like overly long captures
  return version.length > 30 ? '' : version;
}

/** Test a pattern against a value. Returns version (possibly '') when matched, null otherwise. */
export function testPattern(p: Pattern, value: string): string | null {
  if (p.source === '') return '';
  const m = p.regex.exec(value);
  if (!m) return null;
  return resolveVersion(p.version, m);
}
