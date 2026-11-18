#!/usr/bin/env node
/**
 * Reads the running local Supabase instance (`supabase status -o env`) and writes
 * client/.env and server/.env with the right URLs and keys. Cross-platform.
 */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

const result = spawnSync(isWin ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'env'], {
  cwd: root,
  encoding: 'utf8',
  shell: isWin,
});
if (result.status !== 0) {
  console.error('Could not read Supabase status. Is it running? Try `npm run db:start` first.\n');
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

const vars = {};
for (const line of result.stdout.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m) vars[m[1]] = m[2];
}
const apiUrl = vars.API_URL;
const anonKey = vars.ANON_KEY || vars.PUBLISHABLE_KEY;
const serviceKey = vars.SERVICE_ROLE_KEY || vars.SECRET_KEY;
if (!apiUrl || !anonKey || !serviceKey) {
  console.error('Unexpected `supabase status` output; keys not found:\n', result.stdout);
  process.exit(1);
}

/** Merge new values into an existing .env (keeps any other settings the user added). */
async function upsertEnv(file, values, exampleFile) {
  let text = existsSync(file)
    ? await readFile(file, 'utf8')
    : existsSync(exampleFile)
      ? await readFile(exampleFile, 'utf8')
      : '';
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.trimEnd()}\n${k}=${v}\n`;
  }
  await writeFile(file, text.trimStart());
  console.log(`✔ Wrote ${path.relative(root, file)}`);
}

await upsertEnv(
  path.join(root, 'server', '.env'),
  { SUPABASE_URL: apiUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey },
  path.join(root, 'server', '.env.example'),
);
await upsertEnv(
  path.join(root, 'client', '.env'),
  { VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: anonKey },
  path.join(root, 'client', '.env.example'),
);
console.log(`\nStudio: ${vars.STUDIO_URL ?? 'http://127.0.0.1:54323'}`);
console.log(`Mail (magic links): ${vars.INBUCKET_URL ?? vars.MAILPIT_URL ?? 'http://127.0.0.1:54324'}`);
