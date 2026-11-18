import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { ScanRow } from '../../../shared/report';
import { relativeTime } from '../lib/format';

const STEPS = [
  'Opening the site in a headless browser',
  'Waiting for scripts and trackers to load',
  'Checking DNS, SSL certificate and sitemap',
  'Matching against 7,000+ technology fingerprints',
  'Inspecting plugins, themes and platform details',
  'Writing up the report',
];

function ScanProgress({ url }: { url: string }) {
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      setElapsed(s);
      setStep(Math.min(STEPS.length - 1, Math.floor(s / 4)));
    }, 250);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="card mx-auto mt-8 max-w-xl p-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm">{url}</p>
        <span className="font-mono text-xs text-muted">{elapsed.toFixed(0)}s</span>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(95, (elapsed / 25) * 100)}%` }} />
      </div>
      <ul className="mt-5 space-y-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${i < step ? 'text-muted' : i === step ? 'font-medium text-ink' : 'text-line'}`}>
            <span className={`size-1.5 rounded-full ${i < step ? 'bg-good' : i === step ? 'animate-pulse bg-accent' : 'bg-line'}`} />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ScannerPage() {
  const [params] = useSearchParams();
  const [url, setUrl] = useState(params.get('url') ?? '');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Pick<ScanRow, 'id' | 'host' | 'primary_stack' | 'created_at' | 'status'>[]>([]);
  const navigate = useNavigate();
  const autoStarted = useRef(false);

  useEffect(() => {
    supabase
      .from('scans')
      .select('id, host, primary_stack, created_at, status')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => setRecent(data ?? []));
  }, []);

  async function run(target: string) {
    if (!target.trim()) return;
    setScanning(true);
    setError(null);
    try {
      const { scan } = await api.scan(target.trim());
      navigate(`/app/scan/${scan.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Scan failed.');
      setScanning(false);
    }
  }

  // "Re-scan" links land here with ?url=…&auto=1
  useEffect(() => {
    if (params.get('auto') === '1' && params.get('url') && !autoStarted.current) {
      autoStarted.current = true;
      run(params.get('url')!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <section className="mx-auto max-w-2xl pt-6 text-center">
        <p className="eyebrow">Website stack analysis</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">What's this site built with?</h1>
        <p className="mt-3 text-muted">
          CMS, frameworks, plugins, hosting, integrations and page count, with notes to help you scope and quote the work.
        </p>
        <form
          className="mt-8 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(url);
          }}
        >
          <input
            className="input !py-3 font-mono !text-base"
            placeholder="example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={scanning}
            autoFocus
            inputMode="url"
            spellCheck={false}
          />
          <button className="btn-primary !px-6 !py-3" disabled={scanning || !url.trim()}>
            {scanning ? 'Scanning…' : 'Scan site'}
          </button>
        </form>
        {error && <p className="mt-4 rounded-lg bg-bad-soft p-3 text-sm text-bad">{error}</p>}
      </section>

      {scanning && <ScanProgress url={url} />}

      {!scanning && recent.length > 0 && (
        <section className="mx-auto mt-14 max-w-2xl">
          <p className="eyebrow mb-3">Recent scans</p>
          <div className="card divide-y divide-line">
            {recent.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/app/scan/${r.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper"
              >
                <span className="font-mono text-sm">{r.host}</span>
                <span className="truncate text-sm text-muted">{r.status === 'failed' ? 'Failed' : r.primary_stack}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">{relativeTime(r.created_at)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
