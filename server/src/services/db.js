import { PrismaClient } from '@prisma/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import dotenv from 'dotenv';

// Prisma reads env("DATABASE_URL") when the client is instantiated. Because ESM
// imports run before server.js body code, load env here as the DB module boots.
dotenv.config({ path: '.env.local' });
dotenv.config();

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
  console.warn('[db] DATABASE_URL was not set; using local SQLite fallback file:./prisma/dev.db.');
}

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
    ['client_id', 'TEXT'],
    ['signup_ip', 'TEXT'],
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
    // Unique client reference (glondiac-XXXX). Index name matches Prisma's default.
    try {
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "users_client_id_key" ON "users"("client_id")`);
    } catch (err) {
      console.error('[db] Failed to create users.client_id unique index:', err.message);
    }
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

/**
 * Create the `client_projects` table if it doesn't exist. Projects are the
 * parent container for customer work: hosting, domains, email, VPS, builds, and
 * consultations can all be grouped under one project id.
 */
export async function ensureClientProjectsTable() {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "client_projects" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "project_code" TEXT NOT NULL,
        "user_id" TEXT,
        "client_id" TEXT,
        "workspace_id" TEXT,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "service_type" TEXT NOT NULL DEFAULT 'website',
        "status" TEXT NOT NULL DEFAULT 'draft',
        "priority" TEXT NOT NULL DEFAULT 'normal',
        "description" TEXT,
        "metadata" TEXT NOT NULL DEFAULT '{}',
        "archived_at" DATETIME,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "client_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "client_projects_project_code_key" ON "client_projects"("project_code")`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "client_projects_user_id_slug_key" ON "client_projects"("user_id", "slug")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "client_projects_user_id_service_type_idx" ON "client_projects"("user_id", "service_type")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "client_projects_client_id_idx" ON "client_projects"("client_id")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "client_projects_workspace_id_idx" ON "client_projects"("workspace_id")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "client_projects_status_created_at_idx" ON "client_projects"("status", "created_at")`);
  } catch (err) {
    console.error('[db] ensureClientProjectsTable failed:', err.message);
  }
}

/**
 * Create the `deployment_subscriptions` table if it doesn't exist (same
 * push-based reason as above). Without it, trial-subscription writes fail and
 * the deploy-first billing/cleanup timers can't run. Idempotent. SQLite only.
 */
export async function ensureDeploymentSubscriptionsTable() {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "deployment_subscriptions" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "deployment_id" TEXT NOT NULL UNIQUE,
        "user_id" TEXT,
        "checkout_order_id" TEXT,
        "status" TEXT NOT NULL DEFAULT 'trialing',
        "current_period_start" DATETIME,
        "current_period_end" DATETIME,
        "next_billing_at" DATETIME,
        "renewal_reminder_at" DATETIME,
        "last_paid_at" DATETIME,
        "renewal_count" INTEGER NOT NULL DEFAULT 0,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "deployment_subscriptions_user_id_idx" ON "deployment_subscriptions" ("user_id")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "deployment_subscriptions_status_idx" ON "deployment_subscriptions" ("status")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "deployment_subscriptions_next_billing_at_idx" ON "deployment_subscriptions" ("next_billing_at")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "deployment_subscriptions_renewal_reminder_at_idx" ON "deployment_subscriptions" ("renewal_reminder_at")`);
  } catch (err) {
    console.error('[db] ensureDeploymentSubscriptionsTable failed:', err.message);
  }
}

/**
 * Create the `service_requests` table if missing (CRM intake — not tickets).
 * Push-based deploy: schema changes may not run automatically in production.
 * Idempotent. SQLite only. Never drops data.
 */
export async function ensureServiceRequestsTable() {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "service_requests" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "request_number" TEXT NOT NULL,
        "user_id" TEXT,
        "organization_id" TEXT,
        "source" TEXT NOT NULL DEFAULT 'public_form',
        "request_type" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'new',
        "priority" TEXT NOT NULL DEFAULT 'normal',
        "contact_name" TEXT NOT NULL,
        "contact_email" TEXT NOT NULL,
        "contact_phone" TEXT,
        "company_name" TEXT,
        "subject" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "budget_range" TEXT,
        "timeline" TEXT,
        "preferred_contact_method" TEXT,
        "assigned_admin_id" TEXT,
        "converted_lead_id" TEXT,
        "converted_ticket_id" TEXT,
        "metadata" TEXT NOT NULL DEFAULT '{}',
        "admin_notes" TEXT,
        "last_contacted_at" DATETIME,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "service_requests_request_number_key" ON "service_requests" ("request_number")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "service_requests_status_created_at_idx" ON "service_requests" ("status", "created_at")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "service_requests_request_type_created_at_idx" ON "service_requests" ("request_type", "created_at")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "service_requests_user_id_created_at_idx" ON "service_requests" ("user_id", "created_at")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "service_requests_assigned_admin_id_status_idx" ON "service_requests" ("assigned_admin_id", "status")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "service_requests_contact_email_idx" ON "service_requests" ("contact_email")`,
    );
  } catch (err) {
    console.error('[db] ensureServiceRequestsTable failed:', err.message);
  }
}

/**
 * CRM email lists + members (contact capture for admin CRM Email Lists).
 * Idempotent. SQLite only. Never drops data.
 */
export async function ensureCrmEmailTables() {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "crm_email_lists" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "list_type" TEXT NOT NULL DEFAULT 'general',
        "status" TEXT NOT NULL DEFAULT 'active',
        "metadata" TEXT NOT NULL DEFAULT '{}',
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "crm_email_list_members" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email_list_id" TEXT NOT NULL,
        "user_id" TEXT,
        "email" TEXT NOT NULL,
        "name" TEXT,
        "status" TEXT NOT NULL DEFAULT 'subscribed',
        "subscribed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "unsubscribed_at" DATETIME,
        "metadata" TEXT NOT NULL DEFAULT '{}',
        CONSTRAINT "crm_email_list_members_email_list_id_fkey"
          FOREIGN KEY ("email_list_id") REFERENCES "crm_email_lists" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )`);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "crm_email_list_members_email_list_id_email_key"
       ON "crm_email_list_members" ("email_list_id", "email")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "crm_email_list_members_user_id_idx"
       ON "crm_email_list_members" ("user_id")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "crm_email_list_members_email_list_id_idx"
       ON "crm_email_list_members" ("email_list_id")`,
    );
  } catch (err) {
    console.error('[db] ensureCrmEmailTables failed:', err.message);
  }
}

/**
 * Provider resource ownership map (VPS SSH keys, snapshots, backups…).
 * Every provider-account-level resource a customer creates is recorded here so
 * list/delete/restore can be scoped to the owning organization instead of
 * exposing the shared Vultr account. Idempotent. SQLite only.
 */
export async function ensureProviderResourcesTable() {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "provider_resources" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "organization_id" TEXT NOT NULL,
        "user_id" TEXT,
        "service_id" TEXT,
        "provider" TEXT NOT NULL DEFAULT 'vultr',
        "resource_type" TEXT NOT NULL,
        "provider_resource_id" TEXT NOT NULL,
        "name" TEXT,
        "status" TEXT NOT NULL DEFAULT 'active',
        "metadata" TEXT NOT NULL DEFAULT '{}',
        "deleted_at" DATETIME,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "provider_resources_provider_resource_type_provider_resource_id_key"
       ON "provider_resources" ("provider", "resource_type", "provider_resource_id")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "provider_resources_organization_id_resource_type_idx"
       ON "provider_resources" ("organization_id", "resource_type")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "provider_resources_service_id_idx"
       ON "provider_resources" ("service_id")`,
    );
  } catch (err) {
    console.error('[db] ensureProviderResourcesTable failed:', err.message);
  }
}

/**
 * One-time repair for VPS tenancy. JWTs never carried an organizationId, so the
 * old VPS controller filed every record under the shared 'local-org' bucket —
 * which made VPS listing effectively cross-tenant. The controller now uses the
 * verified user id as the organization id; this backfills existing rows to
 * match using the recorded creator/owner. Rows with no known owner (pre-auth
 * dev data) are left untouched. Idempotent. SQLite only.
 */
export async function ensureVpsTenancyBackfill() {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) return;
  try {
    const svc = await prisma.$executeRawUnsafe(
      `UPDATE "vps_services" SET "organization_id" = "created_by_user_id"
       WHERE "organization_id" = 'local-org' AND "created_by_user_id" IS NOT NULL`,
    );
    const access = await prisma.$executeRawUnsafe(
      `UPDATE "service_access" SET "organization_id" = "user_id"
       WHERE "service_type" = 'vps' AND "organization_id" = 'local-org' AND "user_id" IS NOT NULL`,
    );
    const orders = await prisma.$executeRawUnsafe(
      `UPDATE "checkout_orders" SET "organization_id" = "user_id"
       WHERE "type" = 'vps' AND "organization_id" = 'local-org' AND "user_id" IS NOT NULL`,
    );
    const logs = await prisma.$executeRawUnsafe(
      `UPDATE "vps_action_logs" SET "organization_id" =
         (SELECT s."organization_id" FROM "vps_services" s WHERE s."id" = "vps_action_logs"."vps_service_id")
       WHERE "organization_id" = 'local-org'
         AND EXISTS (SELECT 1 FROM "vps_services" s WHERE s."id" = "vps_action_logs"."vps_service_id")`,
    );
    // ServiceAccess rows were only created by the direct-deploy flow; PayPal
    // provisioned services have none, which locks owners out of the management
    // routes (they require an active row). Create the missing rows.
    const accessCreated = await prisma.$executeRawUnsafe(
      `INSERT INTO "service_access" (
         "id", "user_id", "organization_id", "service_type", "service_id", "service_name",
         "access_status", "billing_status", "admin_status", "plan_id", "starts_at",
         "metadata", "created_at", "updated_at")
       SELECT lower(hex(randomblob(16))), s."created_by_user_id", s."organization_id", 'vps', s."id", s."label",
         'active',
         CASE WHEN s."payment_status" IN ('completed', 'active') THEN 'paid'
              WHEN s."payment_status" = 'free' THEN 'free'
              ELSE 'pending' END,
         'allowed', s."plan", s."created_at",
         '{"createdVia":"startup_backfill"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM "vps_services" s
       WHERE s."deleted_at" IS NULL
         AND s."status" NOT IN ('error', 'destroyed')
         AND NOT EXISTS (
           SELECT 1 FROM "service_access" a
           WHERE a."service_type" = 'vps' AND a."service_id" = s."id")`,
    );
    const total = Number(svc) + Number(access) + Number(orders) + Number(logs) + Number(accessCreated);
    if (total > 0) {
      console.log(`[db] VPS tenancy backfill: ${svc} services, ${access} access rows, ${orders} orders, ${logs} action logs re-homed from 'local-org'; ${accessCreated} missing ServiceAccess rows created.`);
    }
  } catch (err) {
    console.error('[db] ensureVpsTenancyBackfill failed:', err.message);
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
