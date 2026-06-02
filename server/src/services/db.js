import { PrismaClient } from '@prisma/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function ensureSqliteUrl(url) {
  if (!url || !url.startsWith('file:')) return url;
  if (url.startsWith('file:///') || url.startsWith('file://')) return url;
  const path = url.slice('file:'.length);
  if (path.startsWith('/')) return `file://${path}`;
  return url;
}

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
    if (dir && dir !== '.' && dir !== '/') mkdirSync(dir, { recursive: true });
  } catch { /* Prisma will surface the real error */ }
}

const rawUrl = process.env.DATABASE_URL;
const normalizedUrl = ensureSqliteUrl(rawUrl);
if (normalizedUrl && normalizedUrl !== rawUrl) {
  process.env.DATABASE_URL = normalizedUrl;
  console.log('[db] DATABASE_URL normalized for runtime safety.');
}
ensureDbDir(process.env.DATABASE_URL);

const globalForPrisma = globalThis;
const slowQueryMs = Number(process.env.PRISMA_SLOW_QUERY_MS || 200);
const logQueries = String(process.env.PRISMA_LOG_QUERIES || 'false').toLowerCase() === 'true';

// NOTE: prisma.$use() was removed in Prisma 5. Soft-delete filtering is done
// explicitly in each route query (where: { deletedAt: null }).
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'stdout', level: 'warn' },
      { emit: 'stdout', level: 'error' },
    ],
  });

prisma.$on('query', (event) => {
  if (logQueries) console.debug(`[db:query] ${event.duration}ms ${event.query}`);
  if (event.duration >= slowQueryMs) console.warn(`[db:slow-query] ${event.duration}ms ${event.query}`);
});

export async function connectPrisma() {
  await prisma.$connect();
}

/**
 * Self-heal additive columns on the `users` table.
 *
 * The project is push-based (no migration files) and `db:push` only runs as a
 * manual script — not on boot, and the `prisma` CLI is a devDependency so it
 * cannot run in production. If the live DB predates a schema change, the Prisma
 * client expects columns the table lacks and EVERY user query throws (500s on
 * login/me/profile/billing/admin). This adds any missing columns idempotently
 * via SQLite `ALTER TABLE ADD COLUMN` so the running DB matches the schema.
 *
 * Only additive, nullable/defaulted columns — never drops or alters existing
 * data. No-op on non-SQLite datasources.
 */
export async function ensureUserColumns() {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) return; // SQLite only

  // Column name (snake_case, matching @map) → SQLite definition.
  const desired = [
    ['phone', 'TEXT'],
    ['profile_details', "TEXT NOT NULL DEFAULT '{}'"],
    ['id_photo_path', 'TEXT'],
    ['account_status', "TEXT NOT NULL DEFAULT 'active'"],
    ['disabled_at', 'DATETIME'],
    ['disabled_reason', 'TEXT'],
    ['deleted_at', 'DATETIME'],
    ['reactivated_at', 'DATETIME'],
    ['promo_eligible', 'BOOLEAN NOT NULL DEFAULT 0'],
    ['promo_signup_rank', 'INTEGER'],
    ['promo_claimed_at', 'DATETIME'],
    ['promo_claimed_order_id', 'TEXT'],
    ['promo_claimed_deployment_id', 'TEXT'],
    ['avatar_path', 'TEXT'],
  ];

  try {
    const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info('users')`);
    if (!Array.isArray(rows) || rows.length === 0) return; // table not created yet (fresh DB → db:push handles it)
    const have = new Set(rows.map((r) => r.name));
    const added = [];
    for (const [name, def] of desired) {
      if (have.has(name)) continue;
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN "${name}" ${def}`);
        added.push(name);
      } catch (err) {
        console.error(`[db] Failed to add users.${name}:`, err.message);
      }
    }
    if (added.length) console.log(`[db] Self-healed missing users columns: ${added.join(', ')}`);
  } catch (err) {
    console.error('[db] ensureUserColumns failed:', err.message);
  }
}

/**
 * Create the `notifications` table if it doesn't exist (same push-based reason
 * as ensureUserColumns). Idempotent. SQLite only.
 */
export async function ensureNotificationsTable() {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "user_id" TEXT,
        "audience" TEXT NOT NULL DEFAULT 'user',
        "type" TEXT NOT NULL DEFAULT 'info',
        "title" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "action_url" TEXT,
        "entity_type" TEXT,
        "entity_id" TEXT,
        "metadata" TEXT NOT NULL DEFAULT '{}',
        "read_at" DATETIME,
        "deleted_at" DATETIME,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "notifications_user_id_read_at_idx" ON "notifications" ("user_id", "read_at")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "notifications_audience_created_at_idx" ON "notifications" ("audience", "created_at")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "notifications_type_created_at_idx" ON "notifications" ("type", "created_at")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "notifications_entity_type_entity_id_idx" ON "notifications" ("entity_type", "entity_id")`);
  } catch (err) {
    console.error('[db] ensureNotificationsTable failed:', err.message);
  }
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}

export async function withTransaction(callback, options = {}) {
  return prisma.$transaction(
    async (tx) => callback(tx),
    {
      maxWait: Number(options.maxWait ?? process.env.PRISMA_TX_MAX_WAIT_MS ?? 5000),
      timeout: Number(options.timeout ?? process.env.PRISMA_TX_TIMEOUT_MS ?? 15000),
      isolationLevel: options.isolationLevel,
    },
  );
}

export async function withCompensatingTransaction({ transaction, compensate }) {
  const compensations = [];
  const addCompensation = (fn) => { if (typeof fn === 'function') compensations.push(fn); };
  try {
    return await withTransaction((tx) => transaction(tx, addCompensation));
  } catch (error) {
    for (const step of compensations.reverse()) {
      try { await step(error); } catch (e) { console.error('[db:compensation-failed]', e); }
    }
    if (typeof compensate === 'function') {
      try { await compensate(error); } catch (e) { console.error('[db:final-compensation-failed]', e); }
    }
    throw error;
  }
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
