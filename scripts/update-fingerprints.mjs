#!/usr/bin/env node
/**
 * Downloads the open technology fingerprint database (enthec/webappanalyzer, GPL-3.0)
 * into server/data/fingerprints. Cross-platform: plain Node, no shell tools.
 *
 *   node scripts/update-fingerprints.mjs            # pinned commit (reproducible)
 *   node scripts/update-fingerprints.mjs --latest   # newest commit on main
 *   node scripts/update-fingerprints.mjs <sha>      # specific commit
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = 'enthec/webappanalyzer';
const PINNED_SHA = '9e52f10a9533c8f7f8d0703c843f7295d56c95a3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'server', 'data', 'fingerprints');

async function resolveRef() {
  const arg = process.argv[2];
  if (arg === '--latest') {
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
      headers: { Accept: 'application/vnd.github.sha', 'User-Agent': 'fingerprint-updater' },
    });
    if (!res.ok) throw new Error(`Could not resolve latest commit: HTTP ${res.status}`);
    return (await res.text()).trim();
  }
  if (arg && /^[0-9a-f]{7,40}$/i.test(arg)) return arg;
  return PINNED_SHA;
}

async function getJson(ref, file) {
  const url = `https://raw.githubusercontent.com/${REPO}/${ref}/src/${file}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 3) throw new Error(`Failed to download ${file}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

const ref = await resolveRef();
console.log(`Downloading fingerprints from ${REPO}@${ref.slice(0, 10)}…`);

const letters = ['_', ...'abcdefghijklmnopqrstuvwxyz'];
await rm(outDir, { recursive: true, force: true });
await mkdir(path.join(outDir, 'technologies'), { recursive: true });

let count = 0;
await Promise.all(
  letters.map(async (l) => {
    const data = await getJson(ref, `technologies/${l}.json`);
    count += Object.keys(data).length;
    await writeFile(path.join(outDir, 'technologies', `${l}.json`), JSON.stringify(data));
  }),
);
for (const f of ['categories.json', 'groups.json']) {
  await writeFile(path.join(outDir, f), JSON.stringify(await getJson(ref, f)));
}
await writeFile(
  path.join(outDir, 'meta.json'),
  JSON.stringify(
    {
      source: `https://github.com/${REPO}`,
      license: 'GPL-3.0',
      sha: ref,
      iconBase: `https://cdn.jsdelivr.net/gh/${REPO}@${ref}/src/images/icons/`,
      fetchedAt: new Date().toISOString(),
      technologies: count,
    },
    null,
    2,
  ),
);
console.log(`✔ Saved ${count} technology fingerprints to server/data/fingerprints`);
