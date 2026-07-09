/**
 * emailService.js — client business email mailboxes + setup requests.
 *
 * MVP foundation only:
 *  - Lists mailboxes from a local JSON store and existing BusinessService /
 *    ServiceAccess rows when available.
 *  - Saves mailbox requests to the store and notifies admins when possible.
 *  - Never stores or returns mailbox passwords or provider API secrets.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';
import { createNotification } from './notificationService.js';

const rootDir = resolve(process.cwd());
const dataDir = resolve(process.env.DATA_DIR || join(rootDir, '.glondia-data'));
const storePath = join(dataDir, 'email-services.json');

const VALID_STATUSES = new Set(['active', 'setup_required', 'suspended']);

function emptyStore() {
  return { mailboxes: [], requests: [] };
}

async function ensureStore() {
  if (existsSync(storePath)) return;
  await mkdir(dataDir, { recursive: true });
  await writeFile(storePath, JSON.stringify(emptyStore(), null, 2));
}

async function readStore() {
  await ensureStore();
  try {
    const raw = JSON.parse(await readFile(storePath, 'utf8'));
    return {
      mailboxes: Array.isArray(raw.mailboxes) ? raw.mailboxes : [],
      requests: Array.isArray(raw.requests) ? raw.requests : [],
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

function safeParse(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

/** Public webmail URL from env — never expose provider credentials. */
export function getWebmailConfig() {
  const url = String(process.env.EMAIL_WEBMAIL_URL || '').trim();
  return {
    webmailUrl: url || null,
    webmailConfigured: Boolean(url),
  };
}

function normalizeStatus(value) {
  const s = String(value || 'setup_required').toLowerCase().replace(/\s+/g, '_');
  if (s === 'pending' || s === 'provisioning' || s === 'setup') return 'setup_required';
  if (s === 'disabled' || s === 'blocked' || s === 'cancelled') return 'suspended';
  if (VALID_STATUSES.has(s)) return s;
  if (s === 'active' || s === 'paid' || s === 'allowed') return 'active';
  return 'setup_required';
}

function publicMailbox(row) {
  const meta = typeof row.metadata === 'string' ? safeParse(row.metadata) : (row.metadata || {});
  const email = row.email || meta.email || row.name || null;
  const domain = row.domain || meta.domain || (email && String(email).includes('@') ? String(email).split('@')[1] : null);
  const { webmailUrl: defaultUrl } = getWebmailConfig();
  return {
    id: row.id,
    email: email || null,
    domain: domain || null,
    status: normalizeStatus(row.status || row.accessStatus),
    webmailUrl: row.webmailUrl || meta.webmailUrl || defaultUrl || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

/** Map BusinessService type=email rows created by this user. */
async function fromBusinessServices(userId) {
  if (!userId || userId === 'local-user') return [];
  try {
    const rows = await prisma.businessService.findMany({
      where: {
        type: 'email',
        deletedAt: null,
        createdByUserId: userId,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => {
      const meta = safeParse(row.metadata);
      return publicMailbox({
        id: row.id,
        email: meta.email || row.name,
        domain: meta.domain || null,
        status: row.status,
        webmailUrl: meta.webmailUrl || null,
        metadata: meta,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    });
  } catch (err) {
    console.warn('[email] BusinessService lookup skipped:', err.message);
    return [];
  }
}

/** Map ServiceAccess serviceType=email for this user. */
async function fromServiceAccess(userId) {
  try {
    const rows = await prisma.serviceAccess.findMany({
      where: { userId, serviceType: 'email' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => {
      const meta = safeParse(row.metadata);
      return publicMailbox({
        id: row.id,
        email: meta.email || row.serviceName || row.serviceId,
        domain: meta.domain || null,
        status: row.accessStatus === 'active' ? 'active'
          : row.accessStatus === 'suspended' ? 'suspended'
          : 'setup_required',
        webmailUrl: meta.webmailUrl || null,
        metadata: meta,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    });
  } catch (err) {
    console.warn('[email] ServiceAccess lookup skipped:', err.message);
    return [];
  }
}

function dedupeMailboxes(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = String(item.email || item.id || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * List mailboxes for a user. Empty array when none exist — never throws for missing data.
 */
export async function listMailboxes(userId) {
  const webmail = getWebmailConfig();
  const store = await readStore();
  const fromFile = (store.mailboxes || [])
    .filter((m) => !userId || m.userId === userId)
    .map(publicMailbox);

  const [biz, access] = await Promise.all([
    fromBusinessServices(userId),
    fromServiceAccess(userId),
  ]);

  return {
    mailboxes: dedupeMailboxes([...fromFile, ...biz, ...access]),
    ...webmail,
  };
}

/**
 * Create a mailbox setup request. Logs + persists; notifies admin audience.
 */
export async function createMailboxRequest(userId, body = {}) {
  const domain = String(body.domain || '').trim().toLowerCase();
  const mailboxName = String(body.mailboxName || '').trim().toLowerCase().replace(/@.*$/, '');
  const notes = String(body.notes || '').trim().slice(0, 2000);

  if (!domain) {
    const err = new Error('Domain name is required.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!mailboxName) {
    const err = new Error('Mailbox name is required.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) {
    const err = new Error('Enter a valid domain name (e.g. example.com).');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!/^[a-z0-9._+-]+$/i.test(mailboxName)) {
    const err = new Error('Mailbox name may only contain letters, numbers, and . _ + -');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const now = new Date().toISOString();
  const email = `${mailboxName}@${domain}`;
  const request = {
    id: randomUUID(),
    userId: userId || null,
    domain,
    mailboxName,
    email,
    notes: notes || null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  try {
    const store = await readStore();
    store.requests = store.requests || [];
    store.requests.unshift(request);
    // Cap history so the file does not grow unbounded.
    if (store.requests.length > 500) store.requests = store.requests.slice(0, 500);
    await writeStore(store);
  } catch (err) {
    console.error('[email] Failed to persist mailbox request:', err.message);
    // Still return success-shaped response after logging so UX is not blocked.
  }

  console.log(`[email] Mailbox request from user=${userId || 'unknown'}: ${email}`);

  // Best-effort admin + user notifications (never fail the request).
  await createNotification({
    userId,
    audience: 'user',
    type: 'info',
    title: 'Mailbox request received',
    message: `We received your request for ${email}. An admin will prepare it shortly.`,
    entityType: 'email_request',
    entityId: request.id,
    metadata: { domain, mailboxName },
  });
  await createNotification({
    audience: 'admin',
    type: 'info',
    title: 'New mailbox request',
    message: `${email} requested by user ${userId || 'unknown'}.`,
    entityType: 'email_request',
    entityId: request.id,
    metadata: { domain, mailboxName, userId, notes: notes || null },
  });

  return {
    id: request.id,
    email,
    domain,
    mailboxName,
    status: request.status,
    message: 'Mailbox request submitted. An admin will prepare it for your domain.',
    createdAt: request.createdAt,
  };
}
