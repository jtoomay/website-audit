import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { screenshotUrl, supabase } from '../lib/supabase';
import type { ScanRow } from '../../../shared/report';
import Report from '../components/report/Report';
import CompareBanner from '../components/report/CompareBanner';

export default function ScanDetailPage() {
  const { id } = useParams();
  const [scan, setScan] = useState<ScanRow | null>(null);
  const [previous, setPrevious] = useState<ScanRow | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setScan(null);
    setPrevious(null);
    setShot(null);
    (async () => {
      const { data, error } = await supabase.from('scans').select('*').eq('id', id).maybeSingle();
      if (error || !data) return setError(error?.message ?? 'Scan not found.');
      setScan(data as ScanRow);
      setShot(await screenshotUrl(data.screenshot_path));
      // Most recent earlier successful scan of the same host, for comparison
      if (data.host) {
        const { data: prev } = await supabase
          .from('scans')
          .select('*')
          .eq('host', data.host)
          .eq('status', 'complete')
          .lt('created_at', data.created_at)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setPrevious((prev as ScanRow) ?? null);
      }
    })();
  }, [id]);

  if (error) {
    return (
      <p className="rounded-lg bg-bad-soft p-4 text-sm text-bad">
        {error} <Link to="/app/history" className="underline">Back to history</Link>
      </p>
    );
  }
  if (!scan) return <p className="text-sm text-muted">Loading report…</p>;
  if (scan.status === 'failed' || !scan.report) {
    return (
      <div className="card p-6">
        <p className="eyebrow">Scan failed</p>
        <h1 className="mt-1 font-mono text-lg">{scan.url}</h1>
        <p className="mt-3 text-sm text-bad">{scan.error ?? 'This scan did not complete.'}</p>
        <Link to={`/app?url=${encodeURIComponent(scan.url)}&auto=1`} className="btn-primary mt-4">
          Try again
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {previous?.report && <CompareBanner older={previous} newer={scan} />}
      <Report report={scan.report} screenshot={shot} rescanUrl={scan.url} />
    </div>
  );
}
