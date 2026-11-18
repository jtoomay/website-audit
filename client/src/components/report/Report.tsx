import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ScanReport } from '../../../../shared/report';
import { copyMarkdown, exportJson, exportMarkdown } from '../../lib/exportReport';
import { formatDate, hostOf } from '../../lib/format';
import TechGrid from './TechGrid';
import {
  ContentPanel,
  InfrastructurePanel,
  InsightsPanel,
  PerformancePanel,
  SecurityPanel,
  SeoPanel,
  ShopifyPanel,
  WordPressPanel,
} from './Panels';

function ExportMenu({ report }: { report: ScanReport }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="no-print flex flex-wrap gap-2">
      <button
        className="btn-ghost !py-1.5"
        onClick={async () => {
          await copyMarkdown(report);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copied ✓' : 'Copy summary'}
      </button>
      <button className="btn-ghost !py-1.5" onClick={() => exportMarkdown(report)}>
        Markdown
      </button>
      <button className="btn-ghost !py-1.5" onClick={() => exportJson(report)}>
        JSON
      </button>
      <button className="btn-ghost !py-1.5" onClick={() => window.print()}>
        PDF
      </button>
    </div>
  );
}

export default function Report({ report: r, screenshot, rescanUrl }: { report: ScanReport; screenshot: string | null; rescanUrl: string }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="card overflow-hidden">
        <div className="grid gap-0 md:grid-cols-[1fr_340px]">
          <div className="p-6">
            <p className="eyebrow">Stack report</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{hostOf(r.finalUrl)}</h1>
            <a href={r.finalUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate font-mono text-xs text-muted hover:text-accent">
              {r.finalUrl}
            </a>
            <p className="mt-5 text-lg leading-snug">{r.primaryStack}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span>{r.technologies.length} technologies</span>
              <span>Scanned {formatDate(r.scannedAt)}</span>
              <span>{(r.durationMs / 1000).toFixed(1)}s</span>
              <span>HTTP {r.status}</span>
              {r.redirects.length > 0 && <span>{r.redirects.length} redirect(s)</span>}
              <span className={r.partial ? 'text-warn' : ''}>{r.mode === 'browser' ? 'Full browser scan' : 'Partial (no browser)'}</span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <ExportMenu report={r} />
              <Link to={`/app?url=${encodeURIComponent(rescanUrl)}&auto=1`} className="no-print btn-primary !py-1.5">
                Re-scan
              </Link>
            </div>
          </div>
          <div className="border-t border-line bg-paper md:border-t-0 md:border-l">
            {screenshot ? (
              <a href={screenshot} target="_blank" rel="noreferrer">
                <img src={screenshot} alt={`Screenshot of ${hostOf(r.finalUrl)}`} className="h-full max-h-64 w-full object-cover object-top md:max-h-none" />
              </a>
            ) : (
              <div className="grid h-full min-h-40 place-items-center text-xs text-muted">No screenshot</div>
            )}
          </div>
        </div>
        {r.warnings.length > 0 && (
          <div className="border-t border-line bg-warn-soft px-6 py-2.5 text-xs text-warn">
            {r.warnings.map((w) => (
              <p key={w}>⚠ {w}</p>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <InsightsPanel r={r} />
        <div className="space-y-6">
          <ContentPanel r={r} />
          {r.wordpress && <WordPressPanel r={r} />}
          {r.shopify && <ShopifyPanel r={r} />}
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Technologies</h2>
        <TechGrid technologies={r.technologies} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <InfrastructurePanel r={r} />
        <SecurityPanel r={r} />
        <SeoPanel r={r} />
        {r.performance && <PerformancePanel r={r} />}
      </div>

      <p className="text-center text-[11px] text-muted">
        Detection data: open-source webappanalyzer fingerprints ({r.fingerprintsVersion}). Results are best-effort. Verify before quoting.
      </p>
    </div>
  );
}
