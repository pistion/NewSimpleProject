/**
 * email.service.js — Dashboard Business Email (setup only).
 *
 * Mailbox lists, setup requests, and DNS record guidance.
 * Never stores mailbox passwords or provider secrets.
 * Webmail reading lives in glondia-mail.service.js.
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

const VALID_STATUSES = new Set(['active', 'pending_setup', 'setup_required', 'suspended']);

function emptyStore() {
  return { mailboxes: [], requests: [], dnsChecks: {} };
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
      dnsChecks: raw.dnsChecks && typeof raw.dnsChecks === 'object' ? raw.dnsChecks : {},
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

export function getWebmailConfig() {
  const url = String(process.env.EMAIL_WEBMAIL_URL || '/mailboxes').trim() || '/mailboxes';
  return {
    webmailUrl: url,
    webmailConfigured: true,
  };
}

/** True when email DNS / provider env is present enough to guide setup. */
export function isEmailProviderConfigured() {
  const provider = String(process.env.EMAIL_PROVIDER || '').trim();
  const mx = String(process.env.EMAIL_MX_HOST || '').trim();
  return Boolean(provider || mx);
}

export function getEmailDnsTemplate(domain) {
  const d = String(domain || '').trim().toLowerCase() || 'yourdomain.com';
  const mxHost = String(process.env.EMAIL_MX_HOST || 'mail.glondia.com').trim() || 'mail.glondia.com';
  const spf = String(process.env.EMAIL_SPF_RECORD || `v=spf1 include:${mxHost} ~all`).trim();
  const dkimSelector = String(process.env.EMAIL_DKIM_SELECTOR || 'glondia').trim() || 'glondia';
  const dkimRecord = String(process.env.EMAIL_DKIM_RECORD || `${dkimSelector}._domainkey.${d} CNAME ${dkimSelector}._domainkey.${mxHost}.`).trim();
  const dmarc = String(process.env.EMAIL_DMARC_RECORD || `v=DMARC1; p=none; rua=mailto:dmarc@${d}`).trim();

  return {
    domain: d,
    configured: isEmailProviderConfigured(),
    message: isEmailProviderConfigured()
      ? 'Add these records at your DNS host, then run Check DNS.'
      : 'Email DNS templates are shown as guidance. Set EMAIL_MX_HOST / EMAIL_PROVIDER on the server for your live values.',
    records: [
      {
        id: 'mx',
        type: 'MX',
        host: '@',
        value: mxHost,
        priority: 10,
        ttl: 3600,
        purpose: 'Routes inbound mail for your domain.',
      },
      {
        id: 'spf',
        type: 'TXT',
        host: '@',
        value: spf,
        priority: null,
        ttl: 3600,
        purpose: 'SPF — authorizes Glondia to send mail for this domain.',
      },
      {
        id: 'dkim',
        type: 'TXT/CNAME',
        host: `${dkimSelector}._domainkey`,
        value: dkimRecord,
        priority: null,
        ttl: 3600,
        purpose: 'DKIM — signs outbound messages to reduce spoofing.',
      },
      {
        id: 'dmarc',
        type: 'TXT',
        host: '_dmarc',
        value: dmarc,
        priority: null,
        ttl: 3600,
        purpose: 'DMARC — reporting policy for failed authentication.',
      },
    ],
    instructions: [
      'Open your domain DNS panel (Spaceship, Cloudflare, or your registrar).',
      'Add the MX, SPF, DKIM, and DMARC records exactly as shown.',
      'Wait for DNS to propagate (often 5–60 minutes).',
      'Return here and click Check DNS.',
      'After DNS verifies, request mailboxes — an admin will prepare them.',
    ],
  };
}

function normalizeStatus(value) {
  const s = String(value || 'pending_setup').toLowerCase().replace(/\s+/g, '_');
  if (s === 'pending' || s === 'provisioning' || s === 'setup' || s === 'setup_required') return 'pending_setup';
  if (s === 'disabled' || s === 'blocked' || s === 'cancelled') return 'suspended';
  if (VALID_STATUSES.has(s)) return s === 'setup_required' ? 'pending_setup' : s;
  if (s === 'active' || s === 'paid' || s === 'allowed') return 'active';
  return 'pending_setup';
}

function publicMailbox(row) {
  const meta = typeof row.metadata === 'string' ? safeParse(row.metadata) : (row.metadata || {});
  const email = row.email || meta.email || row.name || null;
  const domain = row.domain || meta.domain || (email && String(email).includes('@') ? String(email).split('@')[1] : null);
  const { webmailUrl } = getWebmailConfig();
  return {
    id: row.id,
    email: email || null,
    domain: domain || null,
    displayName: row.displayName || meta.displayName || null,
    status: normalizeStatus(row.status || row.accessStatus),
    webmailUrl: row.webmailUrl || meta.webmailUrl || webmailUrl || '/glondiamail',
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

async function fromBusinessServices(userId) {
  if (!userId || userId === 'local-user') return [];
  try {
    const rows = await prisma.businessService.findMany({
      where: { type: 'email', deletedAt: null, createdByUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => {
      const meta = safeParse(row.metadata);
      return publicMailbox({
        id: row.id,
        email: meta.email || row.name,
        domain: meta.domain || null,
        displayName: meta.displayName,
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
        displayName: meta.displayName,
        status: row.accessStatus === 'active' ? 'active'
          : row.accessStatus === 'suspended' ? 'suspended'
          : 'pending_setup',
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

export async function getEmailStatus(userId) {
  const list = await listMailboxes(userId);
  const domains = new Set(
    (list.mailboxes || []).map((m) => m.domain).filter(Boolean)
  );
  const store = await readStore();
  const dnsVerifiedCount = Object.values(store.dnsChecks || {})
    .filter((c) => c?.status === 'verified').length;

  const configured = isEmailProviderConfigured();
  return {
    configured,
    provider: String(process.env.EMAIL_PROVIDER || '').trim() || null,
    message: configured
      ? 'Business Email is ready for setup and mailbox requests.'
      : 'Email provider is not fully configured yet. You can still request mailboxes; DNS templates use defaults until EMAIL_MX_HOST is set.',
    dnsVerified: dnsVerifiedCount > 0,
    dnsStatus: dnsVerifiedCount > 0 ? 'verified' : 'setup_required',
    mailboxCount: (list.mailboxes || []).length,
    domainCount: domains.size,
    webmailUrl: list.webmailUrl || '/glondiamail',
  };
}

export async function createMailboxRequest(userId, body = {}) {
  const domain = String(body.domain || '').trim().toLowerCase();
  const mailboxName = String(body.mailboxName || '').trim().toLowerCase().replace(/@.*$/, '');
  const displayName = String(body.displayName || '').trim().slice(0, 120) || null;
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
    displayName,
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
    if (store.requests.length > 500) store.requests = store.requests.slice(0, 500);
    // Pending mailbox row so the list reflects the request (not active mail yet).
    store.mailboxes = store.mailboxes || [];
    const exists = store.mailboxes.some((m) => String(m.email).toLowerCase() === email);
    if (!exists) {
      store.mailboxes.unshift({
        id: randomUUID(),
        userId: userId || null,
        email,
        domain,
        displayName,
        status: 'pending_setup',
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeStore(store);
  } catch (err) {
    console.error('[email] Failed to persist mailbox request:', err.message);
  }

  console.log(`[email] Mailbox request from user=${userId || 'unknown'}: ${email}`);

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
    metadata: { domain, mailboxName, userId, displayName, notes: notes || null },
  });

  return {
    id: request.id,
    email,
    domain,
    mailboxName,
    displayName,
    status: request.status,
    message: 'Mailbox request submitted. An admin will prepare it for your domain.',
    createdAt: request.createdAt,
  };
}

export async function getEmailDns(domain) {
  return getEmailDnsTemplate(domain);
}

/**
 * DNS check MVP: records configuration presence + last check stamp.
 * Full public DNS queries can be added later without changing the API shape.
 */
export async function checkEmailDns(domain, userId) {
  const d = String(domain || '').trim().toLowerCase();
  if (!d || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d)) {
    const err = new Error('A valid domain is required for DNS check.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const template = getEmailDnsTemplate(d);
  const now = new Date().toISOString();
  // Without live DNS resolver, report setup_required unless provider is fully configured.
  // Never claim verified falsely.
  const status = isEmailProviderConfigured() ? 'pending_propagation' : 'setup_required';
  const result = {
    domain: d,
    status,
    checkedAt: now,
    verified: false,
    message: status === 'pending_propagation'
      ? 'DNS records are defined. Propagation is not auto-verified yet — confirm records at your DNS host, then re-check later.'
      : 'Email provider DNS is not fully configured on the server. Add EMAIL_MX_HOST and related env values.',
    records: template.records.map((r) => ({
      ...r,
      check: 'manual',
      ok: null,
    })),
  };

  try {
    const store = await readStore();
    store.dnsChecks = store.dnsChecks || {};
    store.dnsChecks[d] = {
      status: result.status,
      checkedAt: now,
      userId: userId || null,
    };
    await writeStore(store);
  } catch (err) {
    console.warn('[email] dns check persist skipped:', err.message);
  }

  return result;
}

// Back-compat re-exports used by older imports
export { listMailboxes as listEmailMailboxes };
