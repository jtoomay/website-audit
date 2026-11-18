import type { DomFinding } from './matcher.js';

export interface RequestRecord {
  url: string;
  type: string; // document, script, stylesheet, image, font, xhr, fetch, media, other
  status?: number;
  bytes: number;
}

/** Raw data gathered from the target page by either the browser or fetch collector. */
export interface Collected {
  mode: 'browser' | 'fetch';
  finalUrl: string;
  status: number;
  redirects: string[];
  headers: Record<string, string[]>;
  cookies: Record<string, string[]>;
  html: string;
  htmlBytes: number;
  visibleText?: string;
  css: string;
  js: Map<number, Map<string, string>>;
  dom: Map<number, DomFinding[]>;
  requests: RequestRecord[];
  screenshot?: Buffer;
  timings?: { domContentLoadedMs?: number; loadMs?: number };
  shopifyGlobal?: Record<string, unknown>;
  warnings: string[];
}

/** Add a header/cookie value into a lower-cased multi-map. */
export function addMulti(map: Record<string, string[]>, key: string, value: string) {
  (map[key.toLowerCase()] ??= []).push(value);
}
