import path from 'node:path';
import { SERVER_ROOT as serverRoot } from './paths.js';

// Load server/.env if present (Node's built-in loader; no dotenv dependency).
try {
  process.loadEnvFile(path.join(serverRoot, '.env'));
} catch {
  /* no .env file: rely on real environment variables */
}

const int = (v: string | undefined, d: number) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : d;
};

export const config = {
  serverRoot,
  port: int(process.env.PORT, 8787),
  clientOrigin: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  maxConcurrentScans: int(process.env.MAX_CONCURRENT_SCANS, 2),
  allowPrivateTargets: process.env.ALLOW_PRIVATE_TARGETS === 'true',
  planLimits: {
    free: int(process.env.FREE_MONTHLY_SCANS, 100),
    pro: int(process.env.PRO_MONTHLY_SCANS, 2000),
    agency: int(process.env.AGENCY_MONTHLY_SCANS, 10000),
  } as Record<string, number>,
};
