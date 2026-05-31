// Pre-deploy sanity check: ensure DB directory exists and schema is valid.
// Uses db push (not migrate deploy) since this project uses SQLite without a migrations folder.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[pre-migration] DATABASE_URL is required.');
  process.exit(1);
}

if (databaseUrl.startsWith('file:')) {
  const dbPath = databaseUrl
    .replace(/^file:\/\/\//, '/')
    .replace(/^file:\/\//, '')
    .replace(/^file:\//, '/')
    .replace(/^file:/, '')
    .split('?')[0];
  const dir = dirname(dbPath);
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`[pre-migration] Created SQLite directory: ${dir}`);
  }
}

try {
  if (process.platform === 'win32') {
    execSync('npx prisma validate', { stdio: 'inherit' });
  } else {
    execFileSync('npx', ['prisma', 'validate'], { stdio: 'inherit' });
  }
  console.log('[pre-migration] Schema valid. OK');
} catch (error) {
  console.error('[pre-migration] Failed.');
  process.exit(error.status || 1);
}
