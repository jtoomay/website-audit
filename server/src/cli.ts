/**
 * Scan a site from the terminal without the UI or Supabase:
 *   npm run scan -w server -- example.com
 *   npm run scan -w server -- example.com --fetch     (no headless browser)
 *   npm run scan -w server -- example.com --json      (full report as JSON)
 */
import { scanUrl } from './scan/scan.js';
import { closeBrowser } from './scan/browser.js';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
if (!url) {
  console.error('Usage: npm run scan -w server -- <url> [--fetch] [--json]');
  process.exit(1);
}

try {
  const { report } = await scanUrl(url, {
    mode: args.includes('--fetch') ? 'fetch' : 'auto',
    onProgress: (s) => !args.includes('--json') && console.error(`… ${s}`),
  });
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n${report.finalUrl}  [${report.mode}, ${(report.durationMs / 1000).toFixed(1)}s]`);
    console.log(`Stack: ${report.primaryStack}`);
    console.log(`Complexity: ${report.complexity.label} (${report.complexity.score}/100)\n`);
    for (const t of report.technologies) {
      console.log(`  ${t.name}${t.version ? ` ${t.version}` : ''}  ·  ${t.categories.map((c) => c.name).join(', ')}  (${t.confidence}%)`);
    }
    if (report.wordpress?.plugins.length) {
      console.log(`\nWordPress plugins: ${report.wordpress.plugins.map((p) => p.name).join(', ')}`);
    }
    if (report.sitemap) console.log(`\nSitemap URLs: ${report.sitemap.totalUrls}`);
    for (const w of report.warnings) console.log(`⚠ ${w}`);
  }
} catch (err) {
  console.error('Scan failed:', (err as Error).message);
  process.exitCode = 1;
} finally {
  await closeBrowser();
}
