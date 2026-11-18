import { Link } from 'react-router-dom';
import type { ScanRow } from '../../../../shared/report';
import { diffReports } from '../../lib/diff';
import { relativeTime } from '../../lib/format';

export default function CompareBanner({ older, newer }: { older: ScanRow; newer: ScanRow }) {
  const d = diffReports(older.report!, newer.report!);
  const unchanged = !d.added.length && !d.removed.length && !d.versionChanges.length;
  return (
    <div className="no-print card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
      <span className="text-muted">
        Compared with{' '}
        <Link to={`/app/scan/${older.id}`} className="text-accent hover:underline">
          scan from {relativeTime(older.created_at)}
        </Link>
        :
      </span>
      {unchanged && <span>No technology changes.</span>}
      {d.added.length > 0 && <span className="text-good">+ {d.added.join(', ')}</span>}
      {d.removed.length > 0 && <span className="text-bad">− {d.removed.join(', ')}</span>}
      {d.versionChanges.map((v) => (
        <span key={v.name}>
          {v.name}: <span className="font-mono text-muted">{v.from ?? '?'}</span> → <span className="font-mono">{v.to ?? '?'}</span>
        </span>
      ))}
      {d.pagesDelta ? (
        <span className="text-muted">
          Pages {d.pagesDelta > 0 ? '+' : ''}
          {d.pagesDelta}
        </span>
      ) : null}
    </div>
  );
}
