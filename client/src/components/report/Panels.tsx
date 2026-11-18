import type { ScanReport } from '../../../../shared/report';
import { formatBytes, formatMs } from '../../lib/format';

export function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}

const levelStyle = {
  warning: { dot: 'bg-warn', label: 'Scope', cls: 'text-warn' },
  opportunity: { dot: 'bg-accent', label: 'Upsell', cls: 'text-accent' },
  info: { dot: 'bg-muted', label: 'Note', cls: 'text-muted' },
} as const;

export function InsightsPanel({ r }: { r: ScanReport }) {
  const c = r.complexity;
  const barColor = c.score >= 65 ? 'bg-bad' : c.score >= 40 ? 'bg-warn' : c.score >= 20 ? 'bg-accent' : 'bg-good';
  return (
    <Panel title="Quote insights">
      <div className="rounded-lg bg-paper p-4">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Estimated complexity</span>
          <span className="font-mono text-xs text-muted">{c.score}/100</span>
        </div>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{c.label}</p>
        <div className="mt-2 h-1.5 rounded-full bg-line">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(4, c.score)}%` }} />
        </div>
        {c.factors.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {c.factors.map((f) => (
              <li key={f} className="rounded-full border border-line bg-card px-2.5 py-0.5 text-xs">
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ul className="mt-4 space-y-3">
        {r.insights.map((i, idx) => {
          const s = levelStyle[i.level];
          return (
            <li key={idx} className="flex gap-3">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${s.dot}`} />
              <div>
                <p className="text-sm font-medium">
                  {i.title} <span className={`ml-1 text-[10px] font-semibold uppercase tracking-wider ${s.cls}`}>{s.label}</span>
                </p>
                <p className="text-sm text-muted">{i.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function WordPressPanel({ r }: { r: ScanReport }) {
  const wp = r.wordpress!;
  return (
    <Panel title="WordPress" aside={<span className="text-xs text-muted">{wp.plugins.length} plugins visible</span>}>
      <dl className="divide-y divide-line">
        <Row
          label="Version"
          value={
            wp.version ? (
              <span className={wp.outdated ? 'text-warn' : ''}>
                {wp.version}
                {wp.outdated ? ` (latest ${wp.latestVersion})` : wp.latestVersion ? ' · up to date' : ''}
              </span>
            ) : (
              'Hidden'
            )
          }
        />
        <Row
          label="Theme"
          value={
            wp.theme
              ? `${wp.theme.name ?? wp.theme.slug}${wp.theme.version ? ` ${wp.theme.version}` : ''}${wp.childTheme ? ` (child of ${wp.theme.parent})` : ''}`
              : undefined
          }
        />
        <Row label="Theme author" value={wp.theme?.author?.replace(/<[^>]+>/g, '')} />
        <Row label="Posts" value={wp.counts.posts?.toLocaleString()} />
        <Row label="Pages" value={wp.counts.pages?.toLocaleString()} />
        <Row label="Products" value={wp.counts.products?.toLocaleString()} />
        <Row label="REST API" value={wp.restApi ? 'Open' : 'Disabled / restricted'} />
      </dl>
      {wp.plugins.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {wp.plugins.map((p) => (
                <tr key={p.slug}>
                  <td className="px-3 py-1.5">
                    <a href={`https://wordpress.org/plugins/${p.slug}/`} target="_blank" rel="noreferrer" className="hover:text-accent">
                      {p.name}
                    </a>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-muted">{p.version ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Only plugins that load public assets or REST routes can be seen. Admin-only plugins won't appear.</p>
    </Panel>
  );
}

export function ShopifyPanel({ r }: { r: ScanReport }) {
  const s = r.shopify!;
  return (
    <Panel title="Shopify">
      <dl className="divide-y divide-line">
        <Row label="Theme" value={s.themeName} />
        <Row label="Theme Store ID" value={s.themeStoreId ? String(s.themeStoreId) : 'Custom / unlisted'} />
        <Row label="Store domain" value={s.shop} />
        <Row label="Currency" value={s.currency} />
        <Row label="Country" value={s.country} />
      </dl>
    </Panel>
  );
}

export function ContentPanel({ r }: { r: ScanReport }) {
  const sm = r.sitemap;
  return (
    <Panel title="Site size" aside={sm?.truncated ? <span className="text-xs text-warn">partial count</span> : undefined}>
      {!sm || sm.totalUrls === 0 ? (
        <p className="text-sm text-muted">No sitemap found{sm?.robotsTxt ? '' : ' (and no robots.txt)'}. The page count is unknown.</p>
      ) : (
        <>
          <p className="text-3xl font-semibold tracking-tight">
            {sm.totalUrls.toLocaleString()}
            <span className="ml-2 text-sm font-normal text-muted">URLs in sitemap</span>
          </p>
          <dl className="mt-3 divide-y divide-line">
            {sm.byType.map((b) => (
              <Row key={b.name} label={b.name} value={b.count.toLocaleString()} />
            ))}
          </dl>
          {sm.topSections.length > 1 && (
            <>
              <p className="eyebrow mt-4 mb-1">Top sections</p>
              <div className="flex flex-wrap gap-1.5">
                {sm.topSections.map((s) => (
                  <span key={s.path} className="rounded bg-paper px-2 py-0.5 font-mono text-xs">
                    {s.path} <span className="text-muted">{s.count}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

export function InfrastructurePanel({ r }: { r: ScanReport }) {
  const d = r.dns;
  return (
    <Panel title="Domain, hosting & email">
      <dl className="divide-y divide-line">
        <Row label="Domain" value={d?.domain} />
        <Row label="IP address" value={d?.ips.slice(0, 2).join(', ')} />
        <Row label="Reverse DNS" value={d?.reverseDns[0]} />
        <Row label="DNS provider" value={d?.dnsProvider ?? d?.nameservers[0]} />
        <Row label="Email provider" value={d?.emailProvider ?? d?.mx[0]} />
        <Row label="SSL issuer" value={r.tls?.issuer} />
        <Row
          label="SSL expires"
          value={
            r.tls?.validTo ? (
              <span className={(r.tls.daysRemaining ?? 99) < 14 ? 'text-bad' : ''}>
                {new Date(r.tls.validTo).toLocaleDateString()} ({r.tls.daysRemaining}d)
              </span>
            ) : undefined
          }
        />
        <Row label="TLS" value={r.tls?.protocol} />
      </dl>
      {d && d.services.length > 0 && (
        <>
          <p className="eyebrow mt-4 mb-1.5">Services in DNS records</p>
          <div className="flex flex-wrap gap-1.5">
            {d.services.map((s) => (
              <span key={s} className="rounded bg-paper px-2 py-0.5 text-xs">
                {s}
              </span>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

export function SecurityPanel({ r }: { r: ScanReport }) {
  const s = r.security;
  return (
    <Panel title="Security headers" aside={<span className={`font-mono text-sm ${s.score >= 70 ? 'text-good' : s.score >= 40 ? 'text-warn' : 'text-bad'}`}>{s.score}/100</span>}>
      <ul className="space-y-1.5 text-sm">
        {s.checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span className={c.pass ? 'text-good' : 'text-bad'}>{c.pass ? '✓' : '✕'}</span>
            <span className="min-w-0">
              {c.label}
              {c.detail && !c.pass && <span className="block break-all font-mono text-[11px] text-muted">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function SeoPanel({ r }: { r: ScanReport }) {
  const s = r.seo;
  const lenTag = (n: number, lo: number, hi: number) => (
    <span className={`ml-1 font-mono text-[11px] ${n >= lo && n <= hi ? 'text-good' : 'text-warn'}`}>{n}</span>
  );
  return (
    <Panel title="SEO basics (homepage)">
      <dl className="divide-y divide-line">
        <Row label="Title" value={s.title ? <span title={s.title}>{s.title}{lenTag(s.titleLength, 30, 65)}</span> : <span className="text-bad">Missing</span>} />
        <Row
          label="Meta description"
          value={s.description ? <span title={s.description}>{s.description}{lenTag(s.descriptionLength, 70, 160)}</span> : <span className="text-bad">Missing</span>}
        />
        <Row label="H1" value={s.h1.length ? s.h1[0] + (s.h1.length > 1 ? ` (+${s.h1.length - 1} more)` : '') : <span className="text-bad">None</span>} />
        <Row label="Language" value={s.lang ?? '–'} />
        <Row label="Canonical" value={s.canonical ? 'Set' : 'Missing'} />
        <Row label="Open Graph" value={s.ogTitle || s.ogImage ? 'Set' : 'Missing'} />
        <Row label="Mobile viewport" value={s.viewport ? 'Yes' : <span className="text-bad">No</span>} />
        <Row label="Structured data" value={s.structuredData.join(', ') || 'None'} />
        <Row label="Languages (hreflang)" value={s.hreflangs.length ? s.hreflangs.length : undefined} />
        <Row label="Words on page" value={s.wordCount.toLocaleString()} />
        <Row label="Images missing alt" value={`${s.imagesMissingAlt} of ${s.images}`} />
        <Row label="Links (internal / external)" value={`${s.internalLinks} / ${s.externalLinks}`} />
        <Row label="Forms" value={s.forms} />
        <Row label="Embeds" value={s.iframes.join(', ') || undefined} />
      </dl>
    </Panel>
  );
}

export function PerformancePanel({ r }: { r: ScanReport }) {
  const p = r.performance!;
  return (
    <Panel title="Page weight (homepage)">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Total size', formatBytes(p.totalBytes)],
          ['Requests', p.requests],
          ['Load', formatMs(p.loadMs ?? p.domContentLoadedMs)],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-paper p-2">
            <p className="text-lg font-semibold">{v}</p>
            <p className="text-[11px] text-muted">{k}</p>
          </div>
        ))}
      </div>
      <dl className="mt-3 divide-y divide-line">
        {p.byType.slice(0, 6).map((t) => (
          <Row key={t.type} label={`${t.type} (${t.requests})`} value={formatBytes(t.bytes)} />
        ))}
      </dl>
      <p className="eyebrow mt-4 mb-1">Third-party hosts · {p.thirdPartyRequests} requests</p>
      <div className="flex flex-wrap gap-1.5">
        {p.thirdPartyHosts.map((h) => (
          <span key={h.host} className="rounded bg-paper px-2 py-0.5 font-mono text-[11px]">
            {h.host} <span className="text-muted">{h.requests}</span>
          </span>
        ))}
      </div>
      <p className="eyebrow mt-4 mb-1">Largest files</p>
      <ul className="space-y-1">
        {p.largest.map((a) => (
          <li key={a.url} className="flex gap-2 text-xs">
            <span className="w-14 shrink-0 font-mono text-muted">{formatBytes(a.bytes)}</span>
            <span className="truncate font-mono" title={a.url}>
              {a.url.replace(/^https?:\/\//, '')}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
