import type { ScanReport } from '../../../shared/report';
import { formatBytes, hostOf } from './format';

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fileBase = (r: ScanReport) => `${hostOf(r.finalUrl)}-stack-${r.scannedAt.slice(0, 10)}`;

export function exportJson(r: ScanReport) {
  download(`${fileBase(r)}.json`, JSON.stringify(r, null, 2), 'application/json');
}

/** Markdown summary for pasting into proposals, Notion, emails… */
export function toMarkdown(r: ScanReport): string {
  const lines: string[] = [];
  lines.push(`# Website stack report: ${hostOf(r.finalUrl)}`, '');
  lines.push(`- **URL:** ${r.finalUrl}`);
  lines.push(`- **Scanned:** ${new Date(r.scannedAt).toLocaleString()}`);
  lines.push(`- **Primary stack:** ${r.primaryStack}`);
  lines.push(`- **Estimated complexity:** ${r.complexity.label} (${r.complexity.score}/100)`);
  if (r.sitemap?.totalUrls) lines.push(`- **Pages (sitemap):** ${r.sitemap.totalUrls.toLocaleString()}`);
  if (r.dns?.emailProvider) lines.push(`- **Email:** ${r.dns.emailProvider}`);
  lines.push('');

  if (r.complexity.factors.length) {
    lines.push('## Scope factors', '', ...r.complexity.factors.map((f) => `- ${f}`), '');
  }
  if (r.insights.length) {
    lines.push('## Findings', '');
    for (const i of r.insights) lines.push(`- **${i.title}**: ${i.detail}`);
    lines.push('');
  }

  lines.push('## Technologies', '');
  const groups = new Map<string, string[]>();
  for (const t of r.technologies) {
    const cat = t.categories[0]?.name ?? 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(t.version ? `${t.name} ${t.version}` : t.name);
  }
  for (const [cat, names] of groups) lines.push(`- **${cat}:** ${names.join(', ')}`);
  lines.push('');

  if (r.wordpress) {
    lines.push('## WordPress', '');
    if (r.wordpress.version) lines.push(`- Version: ${r.wordpress.version}${r.wordpress.outdated ? ` (latest ${r.wordpress.latestVersion})` : ''}`);
    if (r.wordpress.theme) lines.push(`- Theme: ${r.wordpress.theme.name ?? r.wordpress.theme.slug}${r.wordpress.theme.version ? ` ${r.wordpress.theme.version}` : ''}`);
    if (r.wordpress.plugins.length) {
      lines.push(`- Plugins (${r.wordpress.plugins.length}):`);
      for (const p of r.wordpress.plugins) lines.push(`  - ${p.name}${p.version ? ` ${p.version}` : ''}`);
    }
    lines.push('');
  }
  if (r.shopify?.themeName) lines.push('## Shopify', '', `- Theme: ${r.shopify.themeName}`, '');

  if (r.sitemap?.byType.length) {
    lines.push('## Content', '', ...r.sitemap.byType.map((b) => `- ${b.name}: ${b.count.toLocaleString()}`), '');
  }
  if (r.performance) {
    lines.push(
      '## Performance (homepage)',
      '',
      `- Page weight: ${formatBytes(r.performance.totalBytes)}`,
      `- Requests: ${r.performance.requests} (${r.performance.thirdPartyRequests} third-party)`,
      '',
    );
  }
  lines.push('## Security headers', '', `Score: ${r.security.score}/100`, '');
  for (const c of r.security.checks) lines.push(`- ${c.pass ? '✅' : '❌'} ${c.label}`);
  return lines.join('\n');
}

export function exportMarkdown(r: ScanReport) {
  download(`${fileBase(r)}.md`, toMarkdown(r), 'text/markdown');
}

export async function copyMarkdown(r: ScanReport) {
  await navigator.clipboard.writeText(toMarkdown(r));
}
