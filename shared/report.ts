// Types shared by the scanner (server) and the UI (client). Type-only: no runtime code.

export interface Category {
  id: number;
  name: string;
  priority: number;
}

export interface Evidence {
  /** Which signal matched: html, headers, cookies, meta, js, dom, scriptSrc, dns, implied… */
  type: string;
  key?: string;
  /** Short excerpt of what matched (truncated). */
  match: string;
}

export interface DetectedTech {
  name: string;
  slug: string;
  description?: string;
  website?: string;
  iconUrl?: string;
  version?: string;
  confidence: number;
  categories: Category[];
  saas?: boolean;
  oss?: boolean;
  pricing?: string[];
  impliedBy?: string[];
  evidence: Evidence[];
}

export interface WordPressPlugin {
  slug: string;
  name: string;
  version?: string;
  source: 'assets' | 'rest-api' | 'both';
}

export interface WordPressInfo {
  version?: string;
  latestVersion?: string;
  outdated?: boolean;
  theme?: {
    slug: string;
    name?: string;
    version?: string;
    author?: string;
    parent?: string;
    uri?: string;
  };
  childTheme?: boolean;
  plugins: WordPressPlugin[];
  restApi: boolean;
  restNamespaces: string[];
  counts: { posts?: number; pages?: number; products?: number };
  siteName?: string;
}

export interface ShopifyInfo {
  shop?: string;
  themeName?: string;
  themeId?: number | string;
  themeStoreId?: number | string;
  currency?: string;
  country?: string;
}

export interface SitemapInfo {
  robotsTxt: boolean;
  sitemaps: string[];
  totalUrls: number;
  truncated: boolean;
  byType: { name: string; count: number }[];
  topSections: { path: string; count: number }[];
}

export interface DnsInfo {
  domain: string;
  ips: string[];
  reverseDns: string[];
  nameservers: string[];
  dnsProvider?: string;
  mx: string[];
  emailProvider?: string;
  /** Services found from TXT/SPF records: e.g. "Mailchimp (SPF)", "Google Search Console". */
  services: string[];
}

export interface TlsInfo {
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  protocol?: string;
  altNames: number;
}

export interface SecurityCheck {
  id: string;
  label: string;
  pass: boolean;
  detail?: string;
}

export interface SecurityInfo {
  https: boolean;
  httpRedirectsToHttps?: boolean;
  checks: SecurityCheck[];
  score: number; // 0-100
  exposedVersions: string[];
}

export interface SeoInfo {
  title?: string;
  titleLength: number;
  description?: string;
  descriptionLength: number;
  canonical?: string;
  lang?: string;
  h1: string[];
  ogTitle?: string;
  ogImage?: string;
  twitterCard?: string;
  favicon?: string;
  viewport: boolean;
  robotsMeta?: string;
  hreflangs: string[];
  structuredData: string[];
  wordCount: number;
  images: number;
  imagesMissingAlt: number;
  internalLinks: number;
  externalLinks: number;
  forms: number;
  iframes: string[];
}

export interface PerfAsset {
  url: string;
  type: string;
  bytes: number;
}

export interface PerfInfo {
  requests: number;
  totalBytes: number;
  byType: { type: string; requests: number; bytes: number }[];
  largest: PerfAsset[];
  thirdPartyRequests: number;
  thirdPartyHosts: { host: string; requests: number }[];
  domContentLoadedMs?: number;
  loadMs?: number;
  htmlBytes: number;
}

export type InsightLevel = 'info' | 'warning' | 'opportunity';

export interface Insight {
  level: InsightLevel;
  title: string;
  detail: string;
}

export interface Complexity {
  score: number; // 0-100
  label: 'Low' | 'Medium' | 'High' | 'Very high';
  factors: string[];
}

export interface ScanReport {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  redirects: string[];
  scannedAt: string;
  durationMs: number;
  mode: 'browser' | 'fetch';
  partial: boolean;
  warnings: string[];
  primaryStack: string;
  technologies: DetectedTech[];
  wordpress?: WordPressInfo;
  shopify?: ShopifyInfo;
  sitemap?: SitemapInfo;
  dns?: DnsInfo;
  tls?: TlsInfo;
  security: SecurityInfo;
  seo: SeoInfo;
  performance?: PerfInfo;
  insights: Insight[];
  complexity: Complexity;
  fingerprintsVersion: string;
}

/** Row in public.scans as the client reads it. */
export interface ScanRow {
  id: string;
  user_id: string;
  url: string;
  final_url: string | null;
  host: string | null;
  status: 'running' | 'complete' | 'failed';
  error: string | null;
  primary_stack: string | null;
  tech_names: string[];
  report: ScanReport | null;
  screenshot_path: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface UsageInfo {
  plan: string;
  used: number;
  limit: number;
}
