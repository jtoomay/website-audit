import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** server/ directory, whether running from src/ (tsx) or dist/ (compiled). */
function findServerRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const SERVER_ROOT = findServerRoot();
export const FINGERPRINTS_DIR = path.join(SERVER_ROOT, 'data', 'fingerprints');
