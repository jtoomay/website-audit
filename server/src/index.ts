import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { requireUser } from './auth.js';
import { consumeCredit, getUsage, refundCredit, scanSlots, userLock } from './limits.js';
import { supabaseAdmin } from './supabase.js';
import { scanUrl } from './scan/scan.js';
import { closeBrowser } from './scan/browser.js';
import { loadFingerprints } from './scan/fingerprints.js';
import { assertPublicHost, normalizeUrl, ScanError, setAllowPrivateTargets } from './scan/urlGuard.js';

setAllowPrivateTargets(config.allowPrivateTargets);

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '10kb' }));

app.get('/api/health', (_req, res) => {
  const fp = loadFingerprints();
  res.json({ ok: true, technologies: fp.technologies.length, fingerprints: fp.sha.slice(0, 10) });
});

app.get('/api/me', requireUser, async (req, res, next) => {
  try {
    res.json({ email: req.user!.email, usage: await getUsage(req.user!.id, req.user!.email) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/scan', requireUser, async (req, res, next) => {
  const user = req.user!;
  let url: URL;
  try {
    url = normalizeUrl(String(req.body?.url ?? ''));
    await assertPublicHost(url.hostname); // reject bad/internal hosts before using a credit or saving a row
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  if (!userLock.tryAcquire(user.id)) {
    res.status(429).json({ error: 'You already have a scan running. Please wait for it to finish.' });
    return;
  }

  let creditTaken = false;
  let scanId: string | undefined;
  try {
    const credit = await consumeCredit(user.id, user.email);
    if (!credit.allowed) {
      res.status(429).json({
        error: `You've used all ${credit.usage.limit} scans on your ${credit.usage.plan} plan this month.`,
        usage: credit.usage,
      });
      return;
    }
    creditTaken = true;

    if (!(await scanSlots.acquire(90_000))) {
      await refundCredit(user.id);
      creditTaken = false;
      res.status(503).json({ error: 'The scanner is busy right now. Please try again in a minute.' });
      return;
    }

    const db = supabaseAdmin();
    try {
      const { data: row, error: insertErr } = await db
        .from('scans')
        .insert({ user_id: user.id, url: url.toString(), host: url.hostname, status: 'running' })
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      scanId = row.id as string;

      const { report, screenshot } = await scanUrl(url.toString());

      let screenshotPath: string | null = null;
      if (screenshot) {
        const path = `${user.id}/${scanId}.jpg`;
        const { error: upErr } = await db.storage.from('screenshots').upload(path, screenshot, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        if (upErr) console.warn('[scan] screenshot upload failed:', upErr.message);
        else screenshotPath = path;
      }

      const { data: saved, error: updErr } = await db
        .from('scans')
        .update({
          status: 'complete',
          final_url: report.finalUrl,
          host: new URL(report.finalUrl).hostname,
          primary_stack: report.primaryStack,
          tech_names: report.technologies.map((t) => t.name),
          report,
          screenshot_path: screenshotPath,
          duration_ms: report.durationMs,
        })
        .eq('id', scanId)
        .select('*')
        .single();
      if (updErr) throw updErr;

      res.json({ scan: saved, usage: credit.usage });
    } finally {
      scanSlots.release();
    }
  } catch (err) {
    if (creditTaken) await refundCredit(user.id).catch(() => {});
    const message = err instanceof ScanError ? err.message : 'The scan failed unexpectedly.';
    if (scanId) {
      await supabaseAdmin().from('scans').update({ status: 'failed', error: message }).eq('id', scanId);
    }
    if (err instanceof ScanError) {
      const status = err.code === 'invalid_url' || err.code === 'blocked' ? 400 : 422;
      res.status(status).json({ error: err.message, code: err.code, scanId });
      return;
    }
    next(err);
  } finally {
    userLock.release(user.id);
  }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] error', err);
  if (!res.headersSent) res.status(500).json({ error: 'Something went wrong on the server.' });
});

const fp = loadFingerprints();
const server = app.listen(config.port, () => {
  console.log(`StackScout API listening on http://localhost:${config.port}  (${fp.technologies.length} fingerprints)`);
  if (!config.supabaseServiceKey) console.warn('⚠ Supabase keys missing. Run `npm run db:start` then `npm run db:env`.');
});
server.requestTimeout = 180_000;

const shutdown = async () => {
  server.close();
  await closeBrowser();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
