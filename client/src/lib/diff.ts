import type { ScanReport } from '../../../shared/report';

export interface ReportDiff {
  added: string[];
  removed: string[];
  versionChanges: { name: string; from?: string; to?: string }[];
  pagesDelta?: number;
}

export function diffReports(older: ScanReport, newer: ScanReport): ReportDiff {
  const a = new Map(older.technologies.map((t) => [t.name, t]));
  const b = new Map(newer.technologies.map((t) => [t.name, t]));
  return {
    added: [...b.keys()].filter((n) => !a.has(n)),
    removed: [...a.keys()].filter((n) => !b.has(n)),
    versionChanges: [...b.values()]
      .filter((t) => a.has(t.name) && (a.get(t.name)!.version ?? '') !== (t.version ?? '') && (t.version || a.get(t.name)!.version))
      .map((t) => ({ name: t.name, from: a.get(t.name)!.version, to: t.version })),
    pagesDelta:
      older.sitemap && newer.sitemap ? newer.sitemap.totalUrls - older.sitemap.totalUrls : undefined,
  };
}
