import type { WordPressInfo, WordPressPlugin } from '../../../../shared/report.js';
import { tryFetch } from '../safeFetch.js';

/** REST namespace → plugin name. Only used when the plugin wasn't seen in asset URLs. */
const NAMESPACE_PLUGINS: Record<string, [string, string]> = {
  'yoast/v1': ['wordpress-seo', 'Yoast SEO'],
  'rankmath/v1': ['seo-by-rank-math', 'Rank Math SEO'],
  'wc/v3': ['woocommerce', 'WooCommerce'],
  'wc/store': ['woocommerce', 'WooCommerce'],
  'contact-form-7/v1': ['contact-form-7', 'Contact Form 7'],
  'elementor/v1': ['elementor', 'Elementor'],
  'elementor-pro/v1': ['elementor-pro', 'Elementor Pro'],
  'jetpack/v4': ['jetpack', 'Jetpack'],
  'wordfence/v1': ['wordfence', 'Wordfence Security'],
  'redirection/v1': ['redirection', 'Redirection'],
  'acf/v3': ['advanced-custom-fields', 'Advanced Custom Fields'],
  'gf/v2': ['gravityforms', 'Gravity Forms'],
  'wpforms/v1': ['wpforms', 'WPForms'],
  'litespeed/v1': ['litespeed-cache', 'LiteSpeed Cache'],
  'wp-rocket/v1': ['wp-rocket', 'WP Rocket'],
  'tribe/events/v1': ['the-events-calendar', 'The Events Calendar'],
  'wpml/v1': ['sitepress-multilingual-cms', 'WPML'],
  'pll/v1': ['polylang', 'Polylang'],
  'learnpress/v1': ['learnpress', 'LearnPress'],
  'ldlms/v2': ['sfwd-lms', 'LearnDash'],
  'tutor/v1': ['tutor', 'Tutor LMS'],
  'mailpoet/v1': ['mailpoet', 'MailPoet'],
  'mc4wp/v1': ['mailchimp-for-wp', 'Mailchimp for WP'],
  'wp-smush/v1': ['wp-smushit', 'Smush'],
  'monsterinsights/v1': ['google-analytics-for-wordpress', 'MonsterInsights'],
  'sitekit/v1': ['google-site-kit', 'Site Kit by Google'],
  'divi/v1': ['divi-builder', 'Divi Builder'],
  'fluentform/v1': ['fluentform', 'Fluent Forms'],
  'ninja-forms/v1': ['ninja-forms', 'Ninja Forms'],
  'buddypress/v1': ['buddypress', 'BuddyPress'],
  'bbp/v1': ['bbpress', 'bbPress'],
  'pmpro/v1': ['paid-memberships-pro', 'Paid Memberships Pro'],
  'memberpress/v1': ['memberpress', 'MemberPress'],
  'wc-bookings/v1': ['woocommerce-bookings', 'WooCommerce Bookings'],
  'wcs/v1': ['woocommerce-subscriptions', 'WooCommerce Subscriptions'],
  'akismet/v1': ['akismet', 'Akismet'],
  'complianz/v1': ['complianz-gdpr', 'Complianz'],
  'cookieyes/v1': ['cookie-law-info', 'CookieYes'],
  'wpcf7/v1': ['contact-form-7', 'Contact Form 7'],
  'aioseo/v1': ['all-in-one-seo-pack', 'All in One SEO'],
  'oembed/1.0': ['', ''],
};

/** Friendly names for common plugin slugs. Unknown slugs are title-cased. */
const PLUGIN_NAMES: Record<string, string> = {
  'wordpress-seo': 'Yoast SEO',
  'seo-by-rank-math': 'Rank Math SEO',
  'all-in-one-seo-pack': 'All in One SEO',
  woocommerce: 'WooCommerce',
  elementor: 'Elementor',
  'elementor-pro': 'Elementor Pro',
  'js_composer': 'WPBakery Page Builder',
  'beaver-builder-lite-version': 'Beaver Builder',
  'bb-plugin': 'Beaver Builder Pro',
  'divi-builder': 'Divi Builder',
  'contact-form-7': 'Contact Form 7',
  gravityforms: 'Gravity Forms',
  wpforms: 'WPForms',
  'wpforms-lite': 'WPForms Lite',
  'ninja-forms': 'Ninja Forms',
  fluentform: 'Fluent Forms',
  jetpack: 'Jetpack',
  'revslider': 'Slider Revolution',
  'LayerSlider': 'LayerSlider',
  'wp-rocket': 'WP Rocket',
  'litespeed-cache': 'LiteSpeed Cache',
  'w3-total-cache': 'W3 Total Cache',
  'wp-super-cache': 'WP Super Cache',
  autoptimize: 'Autoptimize',
  'advanced-custom-fields': 'Advanced Custom Fields',
  'advanced-custom-fields-pro': 'ACF Pro',
  'sitepress-multilingual-cms': 'WPML',
  polylang: 'Polylang',
  'translatepress-multilingual': 'TranslatePress',
  'the-events-calendar': 'The Events Calendar',
  'google-site-kit': 'Site Kit by Google',
  'google-analytics-for-wordpress': 'MonsterInsights',
  'cookie-law-info': 'CookieYes',
  'complianz-gdpr': 'Complianz',
  'mailchimp-for-wp': 'Mailchimp for WP',
  'sfwd-lms': 'LearnDash',
  learnpress: 'LearnPress',
  'memberpress': 'MemberPress',
  'paid-memberships-pro': 'Paid Memberships Pro',
  'woocommerce-subscriptions': 'WooCommerce Subscriptions',
  'woocommerce-gateway-stripe': 'WooCommerce Stripe Gateway',
  'woocommerce-payments': 'WooPayments',
  'essential-addons-for-elementor-lite': 'Essential Addons for Elementor',
  'header-footer-elementor': 'Elementor Header & Footer Builder',
  'ultimate-addons-for-gutenberg': 'Spectra (UAG)',
  'astra-sites': 'Starter Templates',
  'wp-smushit': 'Smush',
  'smart-slider-3': 'Smart Slider 3',
  'wordfence': 'Wordfence Security',
  'akismet': 'Akismet',
  'instagram-feed': 'Smash Balloon Instagram Feed',
  'popup-maker': 'Popup Maker',
  'tablepress': 'TablePress',
  'wp-google-maps': 'WP Go Maps',
  'bbpress': 'bbPress',
  'buddypress': 'BuddyPress',
};

const titleCase = (slug: string) =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

let latestCache: { version: string; at: number } | null = null;

async function latestWordPressVersion(): Promise<string | undefined> {
  if (latestCache && Date.now() - latestCache.at < 12 * 3600_000) return latestCache.version;
  const res = await tryFetch('https://api.wordpress.org/core/version-check/1.7/', { timeoutMs: 5000, accept: 'application/json' });
  try {
    const v = JSON.parse(res?.text ?? '').offers?.[0]?.current;
    if (v) latestCache = { version: v, at: Date.now() };
    return v;
  } catch {
    return undefined;
  }
}

function parseThemeHeader(css: string) {
  const field = (name: string) => css.match(new RegExp(`^[\\s*]*${name}:\\s*(.+)$`, 'mi'))?.[1]?.trim();
  return {
    name: field('Theme Name'),
    version: field('Version'),
    author: field('Author'),
    parent: field('Template'),
    uri: field('Theme URI'),
  };
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

async function countViaRest(origin: string, path: string): Promise<number | undefined> {
  const res = await tryFetch(`${origin}${path}`, { timeoutMs: 8000, maxBytes: 200_000, accept: 'application/json' });
  const total = res?.headers.get('x-wp-total');
  return total ? Number.parseInt(total, 10) : undefined;
}

export async function probeWordPress(opts: {
  origin: string;
  html: string;
  urls: string[];
  detectedVersion?: string;
}): Promise<WordPressInfo> {
  const { origin, html } = opts;
  const haystack = `${html}\n${opts.urls.join('\n')}`;
  const plugins = new Map<string, WordPressPlugin>();

  const pluginRe = /\/wp-content\/plugins\/([a-zA-Z0-9_.-]+)\/[^"'\s)<>]*/g;
  for (const m of haystack.matchAll(pluginRe)) {
    const slug = m[1];
    // Only accept real version numbers (e.g. 3.2.1, 5.0-beta), not cache-busting hashes or timestamps
    const ver = m[0].match(/[?&]ver=(\d{1,4}(?:\.\d{1,4}){1,3}(?:[-.][a-z0-9]{1,10})?)(?:[&"'\s]|$)/i)?.[1];
    const existing = plugins.get(slug);
    // ?ver= often equals the WordPress core version; only trust it if different
    const version = ver && ver !== opts.detectedVersion ? ver : undefined;
    if (existing) {
      if (!existing.version && version) existing.version = version;
    } else {
      plugins.set(slug, { slug, name: PLUGIN_NAMES[slug] ?? titleCase(slug), version, source: 'assets' });
    }
  }

  const themeSlugs = new Set<string>();
  for (const m of haystack.matchAll(/\/wp-content\/themes\/([a-zA-Z0-9_.-]+)\//g)) themeSlugs.add(m[1]);

  // REST API discovery
  const restRes = await tryFetch(`${origin}/wp-json/`, { timeoutMs: 10_000, maxBytes: 3_000_000, accept: 'application/json' });
  let restNamespaces: string[] = [];
  let siteName: string | undefined;
  let restApi = false;
  try {
    const data = JSON.parse(restRes?.text ?? '');
    if (Array.isArray(data?.namespaces)) {
      restApi = true;
      restNamespaces = data.namespaces;
      siteName = data.name || undefined;
    }
  } catch {
    /* REST API disabled or not JSON */
  }
  for (const ns of restNamespaces) {
    const known = NAMESPACE_PLUGINS[ns] ?? Object.entries(NAMESPACE_PLUGINS).find(([k]) => ns.startsWith(k.split('/')[0] + '/'))?.[1];
    if (!known || !known[0]) continue;
    const [slug, name] = known;
    const existing = plugins.get(slug);
    if (existing) existing.source = existing.source === 'assets' ? 'both' : existing.source;
    else plugins.set(slug, { slug, name, source: 'rest-api' });
  }

  // Theme details: prefer the child theme if a parent+child pair exists
  let theme: WordPressInfo['theme'];
  let childTheme = false;
  const slugs = [...themeSlugs];
  const headers = await Promise.all(
    slugs.slice(0, 3).map(async (slug) => {
      const r = await tryFetch(`${origin}/wp-content/themes/${slug}/style.css`, { timeoutMs: 8000, maxBytes: 16_000, accept: 'text/css' });
      return { slug, header: r && r.status === 200 ? parseThemeHeader(r.text) : null };
    }),
  );
  const child = headers.find((h) => h.header?.parent);
  const chosen = child ?? headers.find((h) => h.header?.name) ?? headers[0];
  if (chosen) {
    theme = { slug: chosen.slug, ...(chosen.header ?? {}) };
    childTheme = Boolean(child);
  }

  const [posts, pages, products, latestVersion] = await Promise.all([
    restApi ? countViaRest(origin, '/wp-json/wp/v2/posts?per_page=1&_fields=id') : undefined,
    restApi ? countViaRest(origin, '/wp-json/wp/v2/pages?per_page=1&_fields=id') : undefined,
    restApi && restNamespaces.some((n) => n.startsWith('wc/store'))
      ? countViaRest(origin, '/wp-json/wc/store/v1/products?per_page=1')
      : undefined,
    latestWordPressVersion(),
  ]);

  const version = opts.detectedVersion;
  return {
    version,
    latestVersion,
    outdated: version && latestVersion ? compareVersions(version, latestVersion) < 0 : undefined,
    theme,
    childTheme,
    plugins: [...plugins.values()].sort((a, b) => a.name.localeCompare(b.name)),
    restApi,
    restNamespaces,
    counts: { posts, pages, products },
    siteName,
  };
}
