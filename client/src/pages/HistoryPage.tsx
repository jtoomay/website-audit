import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { ScanRow } from '../../../shared/report';
import { formatDate } from '../lib/format';

type Row = Pick<ScanRow, 'id' | 'url' | 'host' | 'status' | 'error' | 'primary_stack' | 'tech_names' | 'created_at' | 'screenshot_path'>;

export default function HistoryPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState('');
  const [tech, setTech] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let q = supabase
      .from('scans')
      .select('id, url, host, status, error, primary_stack, tech_names, created_at, screenshot_path')
      .order('created_at', { ascending: false })
      .limit(200);
    if (tech) q = q.contains('tech_names', [tech]);
    q.then(({ data, error }) => {
      if (error) setError(error.message);
      setRows(data ?? []);
    });
  }, [tech]);

  const techOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows ?? []) for (const t of r.tech_names) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
  }, [rows]);

  const filtered = (rows ?? []).filter(
    (r) => !search || (r.host ?? r.url).toLowerCase().includes(search.toLowerCase()) || r.primary_stack?.toLowerCase().includes(search.toLowerCase()),
  );

  async function remove(row: Row) {
    if (!window.confirm(`Delete the scan of ${row.host}?`)) return;
    const { error } = await supabase.from('scans').delete().eq('id', row.id);
    if (error) return setError(error.message);
    if (row.screenshot_path) await supabase.storage.from('screenshots').remove([row.screenshot_path]);
    setRows((rs) => rs?.filter((r) => r.id !== row.id) ?? null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="eyebrow">History</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your scans</h1>
        </div>
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <input className="input sm:w-64" placeholder="Search domain or stack…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input sm:w-48" value={tech} onChange={(e) => setTech(e.target.value)}>
            <option value="">All technologies</option>
            {tech && !techOptions.some(([t]) => t === tech) && <option value={tech}>{tech}</option>}
            {techOptions.map(([t, n]) => (
              <option key={t} value={t}>
                {t} ({n})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-bad-soft p-3 text-sm text-bad">{error}</p>}

      <div className="card mt-6 overflow-hidden">
        {rows === null ? (
          <p className="p-6 text-sm text-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted">
            No scans yet. <Link to="/app" className="text-accent hover:underline">Run your first scan →</Link>
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-paper text-left">
              <tr>
                <th className="eyebrow px-4 py-2.5">Site</th>
                <th className="eyebrow hidden px-4 py-2.5 md:table-cell">Stack</th>
                <th className="eyebrow hidden px-4 py-2.5 sm:table-cell">Scanned</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-paper" onClick={() => navigate(`/app/scan/${r.id}`)}>
                  <td className="px-4 py-3">
                    <span className="font-mono">{r.host}</span>
                    {r.status === 'failed' && <span className="ml-2 rounded bg-bad-soft px-1.5 py-0.5 text-xs text-bad">failed</span>}
                    {r.status === 'running' && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-xs text-warn">running</span>}
                    <div className="mt-0.5 text-xs text-muted md:hidden">{r.primary_stack}</div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">{r.status === 'failed' ? r.error : r.primary_stack}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-muted sm:table-cell">{formatDate(r.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button className="text-xs text-muted hover:text-accent" onClick={() => navigate(`/app?url=${encodeURIComponent(r.url)}&auto=1`)}>
                      Re-scan
                    </button>
                    <button className="ml-3 text-xs text-muted hover:text-bad" onClick={() => remove(r)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
