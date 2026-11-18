import type { Complexity, DetectedTech, Insight, ScanReport } from '../../../shared/report.js';

type Draft = Omit<ScanReport, 'insights' | 'complexity' | 'primaryStack'>;

const CAT = {
  CMS: 1,
  ECOMMERCE: 6,
  ANALYTICS: 10,
  BLOGS: 11,
  JS_FRAMEWORKS: 12,
  WEB_FRAMEWORKS: 18,
  LMS: 21,
  MARKETING: 32,
  ADVERTISING: 36,
  PAYMENTS: 41,
  TAG_MANAGERS: 42,
  PAGE_BUILDERS: 51,
  LIVE_CHAT: 52,
  CRM: 53,
  STATIC_SITE: 57,
  JS_LIBRARIES: 59,
  PAAS: 62,
  COOKIE: 67,
  SCHEDULING: 72,
  EMAIL: 75,
  WP_THEMES: 80,
  SHOPIFY_THEMES: 81,
  WP_PLUGINS: 87,
  HOSTING: 88,
  TRANSLATION: 89,
  REVIEWS: 90,
  BNPL: 91,
  RESERVATIONS: 93,
  ECOM_FRONTENDS: 108,
  FORMS: 110,
  DONATIONS: 111,
} as const;

const hasCat = (t: DetectedTech, ...ids: number[]) => t.categories.some((c) => ids.includes(c.id));
const named = (techs: DetectedTech[], name: string) => techs.find((t) => t.name.toLowerCase() === name.toLowerCase());

/** Hosted builders where the design can't be exported. */
const CLOSED_BUILDERS = ['Wix', 'Squarespace', 'Webflow', 'Weebly', 'GoDaddy Website Builder', 'Duda', 'Jimdo', 'Site123', 'Hostinger Website Builder', 'Framer', 'Carrd'];
const PAGE_BUILDERS = ['Elementor', 'Divi', 'WPBakery', 'Beaver Builder', 'Oxygen', 'Bricks', 'Thrive Architect', 'Brizy', 'Visual Composer', 'Avada', 'SeedProd'];

/** Generic labels that shouldn't headline the stack summary or count as builder lock-in. */
const GENERIC = new Set(['Cart Functionality', 'WordPress Block Editor', 'Next.js App Router', 'HTTP/3', 'Open Graph']);

export function primaryStack(techs: DetectedTech[]): string {
  const pick = (ids: number[]) => techs.filter((t) => hasCat(t, ...ids) && t.confidence >= 50 && !GENERIC.has(t.name));
  const parts: DetectedTech[] = [];
  const add = (list: DetectedTech[], max: number) => {
    for (const t of list) {
      if (parts.length >= 4 || max <= 0) break;
      if (!parts.includes(t)) {
        parts.push(t);
        max--;
      }
    }
  };
  add(pick([CAT.CMS, CAT.BLOGS]), 1);
  add(pick([CAT.ECOMMERCE]), 1);
  add(pick([CAT.PAGE_BUILDERS]), 1);
  add(pick([CAT.STATIC_SITE, CAT.ECOM_FRONTENDS]), 1);
  add(pick([CAT.WEB_FRAMEWORKS]), 1);
  add(pick([CAT.JS_FRAMEWORKS]), 1);
  add(pick([CAT.PAAS, CAT.HOSTING]), 1);
  if (!parts.length) return 'Custom / undetected stack';
  return parts.map((t) => (t.version ? `${t.name} ${t.version.split('.').slice(0, 2).join('.')}` : t.name)).join(' + ');
}

export function buildInsights(r: Draft): { insights: Insight[]; complexity: Complexity } {
  const techs = r.technologies;
  const insights: Insight[] = [];
  const factors: string[] = [];
  let score = 0;

  // ── Size ──
  const wpPages = (r.wordpress?.counts.pages ?? 0) + (r.wordpress?.counts.posts ?? 0) + (r.wordpress?.counts.products ?? 0);
  const pages = Math.max(r.sitemap?.totalUrls ?? 0, wpPages);
  if (pages > 0) {
    const pts = pages > 2000 ? 30 : pages > 500 ? 22 : pages > 100 ? 14 : pages > 25 ? 7 : 2;
    score += pts;
    factors.push(`${pages.toLocaleString()} URLs found`);
    insights.push({
      level: pages > 500 ? 'warning' : 'info',
      title: `About ${pages.toLocaleString()} pages`,
      detail:
        pages > 500
          ? 'Large site: plan for automated content migration, redirect mapping and URL-preservation work.'
          : 'Count from the sitemap / CMS API. Use it to estimate content entry and page template work.',
    });
  } else {
    insights.push({ level: 'info', title: 'Page count unknown', detail: 'No sitemap found. Ask the client for a page list or crawl the site before quoting.' });
  }

  // ── Platform ──
  const closed = techs.find((t) => CLOSED_BUILDERS.includes(t.name));
  if (closed) {
    score += 10;
    factors.push(`${closed.name} (closed platform)`);
    insights.push({
      level: 'warning',
      title: `Built on ${closed.name}`,
      detail: `${closed.name} doesn't allow exporting the design or code. A redesign means a full rebuild, and content must be migrated by hand or with scraping.`,
    });
  }
  const wp = named(techs, 'WordPress');
  if (wp) {
    const pluginCount = r.wordpress?.plugins.length ?? 0;
    if (pluginCount) {
      score += Math.min(15, pluginCount);
      factors.push(`${pluginCount} WordPress plugins`);
      insights.push({
        level: pluginCount > 20 ? 'warning' : 'info',
        title: `${pluginCount} WordPress plugins detected`,
        detail:
          pluginCount > 20
            ? 'Heavy plugin use. Budget time for a plugin audit, updates and compatibility testing. More may be installed than are visible publicly.'
            : 'Visible plugins only; admin-only plugins won\'t show up. Confirm the full list with the client.',
      });
    }
    if (r.wordpress?.outdated) {
      insights.push({
        level: 'opportunity',
        title: `WordPress ${r.wordpress.version} is out of date`,
        detail: `Latest is ${r.wordpress.latestVersion}. Offer a maintenance / update package.`,
      });
    }
    if (r.wordpress?.childTheme === false && r.wordpress.theme?.name) {
      insights.push({
        level: 'info',
        title: `Theme: ${r.wordpress.theme.name}`,
        detail: 'No child theme detected. Customizations may be lost when the theme updates.',
      });
    }
  }
  const builder = techs.find(
    (t) => !GENERIC.has(t.name) && (PAGE_BUILDERS.some((b) => t.name.startsWith(b)) || (hasCat(t, CAT.PAGE_BUILDERS) && !CLOSED_BUILDERS.includes(t.name))),
  );
  if (builder) {
    score += 6;
    factors.push(`${builder.name} page builder`);
    insights.push({
      level: 'warning',
      title: `Uses the ${builder.name} page builder`,
      detail: 'Layouts are locked to the builder. Moving away means rebuilding every page template. Editing within it is quick.',
    });
  }

  // ── Commerce ──
  const ecommerce = techs.filter((t) => hasCat(t, CAT.ECOMMERCE) && !GENERIC.has(t.name));
  if (ecommerce.length) {
    score += 20;
    factors.push(`E-commerce (${ecommerce.map((t) => t.name).join(', ')})`);
    const products = r.wordpress?.counts.products ?? r.sitemap?.byType.find((b) => b.name === 'Products')?.count;
    insights.push({
      level: 'warning',
      title: `E-commerce: ${ecommerce.map((t) => t.name).join(', ')}`,
      detail: `${products ? `~${products.toLocaleString()} products. ` : ''}Migrating products, customers, orders, payment gateways and taxes adds significant scope.`,
    });
  }
  const payments = techs.filter((t) => hasCat(t, CAT.PAYMENTS, CAT.BNPL));
  if (payments.length) factors.push(`Payments: ${payments.map((t) => t.name).join(', ')}`);

  // ── Advanced features ──
  const features: [number[], string, number][] = [
    [[CAT.LMS], 'Online courses (LMS)', 12],
    [[CAT.SCHEDULING, CAT.RESERVATIONS], 'Booking / scheduling', 8],
    [[CAT.TRANSLATION], 'Multilingual', 10],
    [[CAT.DONATIONS], 'Donations', 5],
  ];
  for (const [ids, label, pts] of features) {
    const found = techs.filter((t) => hasCat(t, ...ids));
    if (found.length) {
      score += pts;
      factors.push(label);
      insights.push({ level: 'info', title: label, detail: `Detected: ${found.map((t) => t.name).join(', ')}. Include this functionality in scope.` });
    }
  }
  const membership = r.wordpress?.plugins.find((p) => /member|subscription|restrict|ultimate-member|buddypress/i.test(p.slug));
  if (membership) {
    score += 8;
    factors.push('Memberships / user accounts');
    insights.push({ level: 'info', title: 'Members / user accounts', detail: `${membership.name} detected. User data and logins need migrating.` });
  }
  if ((r.seo.hreflangs?.length ?? 0) > 1 && !techs.some((t) => hasCat(t, CAT.TRANSLATION))) {
    score += 8;
    factors.push(`${r.seo.hreflangs.length} languages (hreflang)`);
  }

  // ── Integrations ──
  const integrations = techs.filter((t) =>
    hasCat(t, CAT.ANALYTICS, CAT.MARKETING, CAT.ADVERTISING, CAT.LIVE_CHAT, CAT.CRM, CAT.EMAIL, CAT.TAG_MANAGERS, CAT.REVIEWS, CAT.FORMS),
  );
  if (integrations.length) {
    score += Math.min(15, integrations.length * 1.5);
    factors.push(`${integrations.length} third-party integrations`);
    insights.push({
      level: integrations.length > 10 ? 'warning' : 'info',
      title: `${integrations.length} marketing & analytics integrations`,
      detail: `${integrations.slice(0, 8).map((t) => t.name).join(', ')}${integrations.length > 8 ? '…' : ''}. Each needs re-installing and testing on a rebuild.`,
    });
  }
  if (!techs.some((t) => hasCat(t, CAT.ANALYTICS))) {
    insights.push({ level: 'opportunity', title: 'No analytics detected', detail: 'Offer analytics setup (GA4 / Plausible) and conversion tracking.' });
  }
  if (!techs.some((t) => hasCat(t, CAT.COOKIE)) && techs.some((t) => hasCat(t, CAT.ANALYTICS, CAT.ADVERTISING))) {
    insights.push({ level: 'opportunity', title: 'Tracking without a cookie banner', detail: 'Analytics/ads are loaded but no consent tool was found. A GDPR/CCPA risk, and an easy upsell.' });
  }

  // ── Custom app ──
  const cms = techs.some((t) => hasCat(t, CAT.CMS, CAT.ECOMMERCE, CAT.BLOGS)) || closed;
  const spa = techs.find((t) => ['React', 'Vue.js', 'Angular', 'Svelte', 'Next.js', 'Nuxt.js', 'Remix', 'Gatsby', 'Astro', 'SvelteKit'].includes(t.name));
  if (spa && !cms) {
    score += 12;
    factors.push(`Custom ${spa.name} build`);
    insights.push({
      level: 'warning',
      title: `Custom ${spa.name} application`,
      detail: 'No off-the-shelf CMS detected. Likely custom-coded. Expect developer-level work and ask whether a headless CMS is behind it.',
    });
  }

  // ── Outdated tech ──
  const jq = named(techs, 'jQuery');
  if (jq?.version && /^1\.|^2\./.test(jq.version)) {
    insights.push({ level: 'opportunity', title: `Outdated jQuery ${jq.version}`, detail: 'Old jQuery has known security issues. A sign the site hasn\'t been maintained.' });
  }
  const php = named(techs, 'PHP');
  if (php?.version && /^(5|7)\./.test(php.version)) {
    insights.push({ level: 'opportunity', title: `End-of-life PHP ${php.version}`, detail: 'PHP 7.x and older no longer get security fixes. Offer a hosting/PHP upgrade.' });
  }

  // ── Security / performance / SEO ──
  if (r.security.score < 50) {
    insights.push({ level: 'opportunity', title: `Weak security headers (${r.security.score}/100)`, detail: 'Missing HSTS/CSP and similar headers. A quick hardening win.' });
  }
  if (!r.security.https) insights.push({ level: 'warning', title: 'No HTTPS', detail: 'Site loads over plain HTTP. Browsers flag it as "Not secure".' });
  if (r.tls?.daysRemaining !== undefined && r.tls.daysRemaining < 14) {
    insights.push({ level: 'warning', title: `SSL certificate expires in ${r.tls.daysRemaining} days`, detail: `Issued by ${r.tls.issuer ?? 'unknown'}.` });
  }
  if (r.performance) {
    const mb = r.performance.totalBytes / 1_048_576;
    if (mb > 5 || r.performance.requests > 150) {
      insights.push({
        level: 'opportunity',
        title: `Heavy page: ${mb.toFixed(1)} MB, ${r.performance.requests} requests`,
        detail: 'Performance optimization (images, scripts, caching) could noticeably improve speed and Core Web Vitals.',
      });
    }
  }
  if (!r.seo.description) insights.push({ level: 'opportunity', title: 'Missing meta description', detail: 'Basic on-page SEO is incomplete on the homepage.' });
  if (r.seo.h1.length !== 1) {
    insights.push({ level: 'opportunity', title: r.seo.h1.length ? `${r.seo.h1.length} H1 headings` : 'No H1 heading', detail: 'The homepage should have exactly one H1.' });
  }
  if (!r.seo.viewport) insights.push({ level: 'warning', title: 'Not mobile-friendly', detail: 'No viewport meta tag. The site likely isn\'t responsive.' });

  // ── Hosting / email context ──
  if (r.dns?.emailProvider && !r.dns.emailProvider.startsWith('No email')) {
    insights.push({ level: 'info', title: `Email on ${r.dns.emailProvider}`, detail: 'Be careful not to break MX records when changing DNS or hosting.' });
  }

  score = Math.min(100, Math.round(score));
  const label: Complexity['label'] = score >= 65 ? 'Very high' : score >= 40 ? 'High' : score >= 20 ? 'Medium' : 'Low';
  const order = { warning: 0, opportunity: 1, info: 2 } as const;
  insights.sort((a, b) => order[a.level] - order[b.level]);
  return { insights, complexity: { score, label, factors } };
}
