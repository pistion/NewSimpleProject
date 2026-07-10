/**
 * CRM contact emails — stores every client account email (and other contact
 * emails) in crm_email_lists / crm_email_list_members with name + userId.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';

const CLIENT_LIST_NAME = 'Client Accounts';
const CLIENT_LIST_TYPE = 'client_accounts';
const SR_LIST_NAME = 'Service Request Contacts';
const SR_LIST_TYPE = 'service_requests';

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status, expose: true });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function parseMeta(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function memberView(m, list = null) {
  const meta = parseMeta(m.metadata);
  return {
    id: m.id,
    emailListId: m.emailListId,
    listName: list?.name || meta.listName || null,
    listType: list?.listType || meta.listType || null,
    userId: m.userId || null,
    databaseId: m.userId || m.id,
    email: m.email,
    name: m.name || null,
    status: m.status || 'subscribed',
    subscribedAt: m.subscribedAt,
    unsubscribedAt: m.unsubscribedAt || null,
    source: meta.source || null,
    role: meta.role || null,
    accountStatus: meta.accountStatus || null,
    metadata: meta,
  };
}

async function ensureList({ name, listType, description }) {
  const existing = await prisma.crmEmailList.findFirst({
    where: { listType, name },
  });
  if (existing) return existing;
  return prisma.crmEmailList.create({
    data: {
      id: randomUUID(),
      name,
      listType,
      description: description || null,
      status: 'active',
      metadata: JSON.stringify({ managed: true }),
    },
  });
}

export async function ensureClientAccountsList() {
  return ensureList({
    name: CLIENT_LIST_NAME,
    listType: CLIENT_LIST_TYPE,
    description: 'All registered client dashboard accounts (email + name + database user id).',
  });
}

export async function ensureServiceRequestContactsList() {
  return ensureList({
    name: SR_LIST_NAME,
    listType: SR_LIST_TYPE,
    description: 'Contact emails captured from service-request intake forms.',
  });
}

/**
 * Upsert a contact email into a CRM list. Prefer Client Accounts when userId is set.
 * Safe to call from registration / OAuth / service-request create (never throws to callers unless requested).
 */
export async function captureContactEmail({
  email,
  name = null,
  userId = null,
  source = 'manual',
  listType = null,
  role = null,
  accountStatus = null,
  metadata = {},
  throwOnError = false,
} = {}) {
  try {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      if (throwOnError) throw httpError('A valid email is required.');
      return null;
    }

    const type = listType || (userId ? CLIENT_LIST_TYPE : 'general');
    const list = type === CLIENT_LIST_TYPE
      ? await ensureClientAccountsList()
      : type === SR_LIST_TYPE
        ? await ensureServiceRequestContactsList()
        : await ensureList({
          name: type === 'general' ? 'General Contacts' : String(type),
          listType: type,
          description: 'CRM captured contacts',
        });

    const meta = {
      source: source || 'manual',
      role: role || null,
      accountStatus: accountStatus || null,
      listName: list.name,
      listType: list.listType,
      ...metadata,
      capturedAt: new Date().toISOString(),
    };

    const existing = await prisma.crmEmailListMember.findUnique({
      where: {
        emailListId_email: {
          emailListId: list.id,
          email: normalized,
        },
      },
    });

    if (existing) {
      const prev = parseMeta(existing.metadata);
      const updated = await prisma.crmEmailListMember.update({
        where: { id: existing.id },
        data: {
          userId: userId || existing.userId || null,
          name: name != null && String(name).trim() ? String(name).trim() : existing.name,
          status: existing.status === 'unsubscribed' ? existing.status : 'subscribed',
          metadata: JSON.stringify({ ...prev, ...meta }),
        },
      });
      return memberView(updated, list);
    }

    const created = await prisma.crmEmailListMember.create({
      data: {
        id: randomUUID(),
        emailListId: list.id,
        userId: userId || null,
        email: normalized,
        name: name != null && String(name).trim() ? String(name).trim() : null,
        status: 'subscribed',
        metadata: JSON.stringify(meta),
      },
    });
    return memberView(created, list);
  } catch (err) {
    if (throwOnError) throw err;
    console.warn('[crm-contacts] capture failed:', err.message);
    return null;
  }
}

/**
 * Sync every registered User into Client Accounts list (name + email + database id).
 * Also pulls service-request contact emails into their list.
 */
export async function syncAllClientContacts() {
  const list = await ensureClientAccountsList();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      accountStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  let captured = 0;
  let skipped = 0;
  for (const u of users) {
    if (!isValidEmail(u.email)) {
      skipped += 1;
      continue;
    }
    const row = await captureContactEmail({
      email: u.email,
      name: u.name || u.email.split('@')[0],
      userId: u.id,
      source: 'user_sync',
      listType: CLIENT_LIST_TYPE,
      role: u.role,
      accountStatus: u.accountStatus || 'active',
      metadata: { registeredAt: u.createdAt },
    });
    if (row) captured += 1;
    else skipped += 1;
  }

  // Service request contacts (form leads without accounts)
  let srCaptured = 0;
  try {
    await ensureServiceRequestContactsList();
    const srs = await prisma.serviceRequest.findMany({
      select: {
        id: true,
        contactEmail: true,
        contactName: true,
        userId: true,
        companyName: true,
        requestType: true,
        createdAt: true,
      },
      take: 5000,
      orderBy: { createdAt: 'desc' },
    });
    for (const sr of srs) {
      const row = await captureContactEmail({
        email: sr.contactEmail,
        name: sr.contactName,
        userId: sr.userId || null,
        source: 'service_request',
        listType: SR_LIST_TYPE,
        metadata: {
          serviceRequestId: sr.id,
          companyName: sr.companyName || null,
          requestType: sr.requestType,
          createdAt: sr.createdAt,
        },
      });
      if (row) srCaptured += 1;
    }
  } catch (err) {
    console.warn('[crm-contacts] service request sync skipped:', err.message);
  }

  const totalMembers = await prisma.crmEmailListMember.count({ where: { emailListId: list.id } });

  return {
    listId: list.id,
    listName: list.name,
    usersScanned: users.length,
    clientEmailsCaptured: captured,
    clientSkipped: skipped,
    serviceRequestEmailsCaptured: srCaptured,
    clientListMemberCount: totalMembers,
  };
}

export async function listCrmEmailLists() {
  const lists = await prisma.crmEmailList.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { members: true } } },
  });
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    listType: l.listType,
    status: l.status,
    memberCount: l._count?.members ?? 0,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  }));
}

/**
 * List contact emails for CRM Email Lists UI.
 * Defaults to all members; filter by listType=client_accounts for clients only.
 */
export async function listCrmContacts({ listType = null, q = '', limit = 2000 } = {}) {
  // Ensure client list exists before listing so the UI always has a bucket
  await ensureClientAccountsList();

  const where = {};
  if (listType) {
    where.emailList = { listType: String(listType) };
  }
  const query = String(q || '').trim();
  if (query) {
    where.OR = [
      { email: { contains: query } },
      { name: { contains: query } },
      { userId: { contains: query } },
    ];
  }

  const rows = await prisma.crmEmailListMember.findMany({
    where,
    include: { emailList: true },
    orderBy: { subscribedAt: 'desc' },
    take: Math.min(Math.max(Number(limit) || 2000, 1), 5000),
  });

  return rows.map((m) => memberView(m, m.emailList));
}

export async function getCrmContactsOverview() {
  await ensureClientAccountsList();
  await ensureServiceRequestContactsList();

  const [lists, clientCount, srCount, total, recent] = await Promise.all([
    listCrmEmailLists(),
    prisma.crmEmailListMember.count({
      where: { emailList: { listType: CLIENT_LIST_TYPE } },
    }),
    prisma.crmEmailListMember.count({
      where: { emailList: { listType: SR_LIST_TYPE } },
    }),
    prisma.crmEmailListMember.count(),
    prisma.crmEmailListMember.findMany({
      include: { emailList: true },
      orderBy: { subscribedAt: 'desc' },
      take: 12,
    }),
  ]);

  return {
    lists,
    summary: {
      totalContacts: total,
      clientAccounts: clientCount,
      serviceRequestContacts: srCount,
    },
    recent: recent.map((m) => memberView(m, m.emailList)),
  };
}

export default {
  captureContactEmail,
  syncAllClientContacts,
  listCrmEmailLists,
  listCrmContacts,
  getCrmContactsOverview,
  ensureClientAccountsList,
};
