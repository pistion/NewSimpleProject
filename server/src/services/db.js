import { PrismaClient } from '@prisma/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Normalize DATABASE_URL for SQLite absolute paths.
// SQLite's C library requires file:///path (3 slashes) for absolute paths.
// Render sets DATABASE_URL=file:/var/glondia/data/glondia.db (1 slash) which
// some SQLite builds treat as relative, causing SQLITE_CANTOPEN (error 14).
function ensureSqliteUrl(url) {
  if (!url || !url.startsWith('file:')) return url;
  // Already correct (file:/// or file://) → leave as-is
  if (url.startsWith('file:///') || url.startsWith('file://')) return url;
  // file:/absolute/path → file:///absolute/path
  const path = url.slice('file:'.length); // "/var/glondia/data/glondia.db"
  if (path.startsWith('/')) return `file://${path}`; // → file:///var/...
  return url; // relative path — leave unchanged
}

// Pre-create the data directory so SQLite can open/create the DB file.
// This is a safety net in case startCommand's mkdir -p didn't run yet.
function ensureDbDir(url) {
  if (!url || !url.startsWith('file:')) return;
  try {
    const path = url
      .replace(/^file:\/\/\//, '/')
      .replace(/^file:\/\//, '')
      .replace(/^file:\//, '/')
      .replace(/^file:/, '')
      .split('?')[0];
    const dir = dirname(path);
    if (dir && dir !== '.' && dir !== '/') {
      mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Best-effort — Prisma will give a clear error if the dir truly can't be created
  }
}

const rawUrl = process.env.DATABASE_URL;
const normalized = ensureSqliteUrl(rawUrl);
if (normalized && normalized !== rawUrl) {
  process.env.DATABASE_URL = normalized;
  console.log(`[db] Normalized DATABASE_URL: ${normalized}`);
}
ensureDbDir(process.env.DATABASE_URL);

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
