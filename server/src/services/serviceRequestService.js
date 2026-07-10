/**
 * serviceRequestService.js — CRM Service Requests (intake / consultation).
 *
 * Distinct from Ticket support issues:
 *  - ServiceRequest = sales/intake (build, consult, setup, migration, etc.)
 *  - Ticket         = customer support after they already have a service
 */

import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';
import { writeAuditLog } from './auditLogService.js';
import { createTicket } from './ticketService.js';

function httpError(msg, status = 400, code = 'VALIDATION_ERROR') {
  return Object.assign(new Error(msg), { status, code, expose: true });
}

export const REQUEST_TYPES = new Set([
  'consultation',
  'website_build',
  'domain',
  'hosting',
  'vps',
  'email',
  'migration',
  'ai_automation',
  'custom',
]);

export const STATUSES = new Set([
  'new',
  'reviewing',
  'contacted',
  'quoted',
  'approved',
  'in_progress',
  'completed',
  'cancelled',
  'rejected',
]);

export const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

export const SOURCES = new Set([
  'public_form',
  'customer_dashboard',
  'admin_created',
  'website_bot',
  'consultation',
]);

function safeJson(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function yearPrefix() {
  return new Date().getFullYear();
}

/** Human-readable sequential id: SR-2026-000001 */
async function nextRequestNumber() {
  const year = yearPrefix();
  const prefix = `SR-${year}-`;
  const latest = await prisma.serviceRequest.findFirst({
    where: { requestNumber: { startsWith: prefix } },
    orderBy: { requestNumber: 'desc' },
    select: { requestNumber: true },
  });
  let seq = 1;
  if (latest?.requestNumber) {
    const tail = latest.requestNumber.slice(prefix.length);
    const n = Number.parseInt(tail, 10);
    if (Number.isFinite(n) && n >= 1) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

export function publicServiceRequest(row) {
  if (!row) return null;
  const metadata = safeJson(row.metadata);
  return {
    id: row.id,
    requestNumber: row.requestNumber,
    userId: row.userId,
    organizationId: row.organizationId,
    source: row.source,
    requestType: row.requestType,
    status: row.status,
    priority: row.priority,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    companyName: row.companyName,
    subject: row.subject,
    description: row.description,
    budgetRange: row.budgetRange,
    timeline: row.timeline,
    preferredContactMethod: row.preferredContactMethod,
    assignedAdminId: row.assignedAdminId,
    convertedLeadId: row.convertedLeadId,
    convertedTicketId: row.convertedTicketId,
    metadata,
    adminNotes: row.adminNotes,
    lastContactedAt: row.lastContactedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // CRM UI compatibility aliases
    name: row.contactName,
    email: row.contactEmail,
    phone: row.contactPhone,
    serviceNeeded: row.requestType,
    message: row.description,
    submittedAt: row.createdAt,
    sourceType: row.source,
  };
}

function normalizeCreateBody(body = {}, extras = {}) {
  const requestType = String(body.requestType || body.serviceNeeded || body.type || 'custom')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const source = String(body.source || extras.source || 'public_form')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const priority = String(body.priority || 'normal').trim().toLowerCase();
  const contactName = String(body.contactName || body.name || '').trim();
  const contactEmail = String(body.contactEmail || body.email || '').trim().toLowerCase();
  const contactPhone = String(body.contactPhone || body.phone || '').trim() || null;
  const companyName = String(body.companyName || body.company || '').trim() || null;
  const subject = String(body.subject || body.serviceNeeded || '').trim();
  const description = String(body.description || body.message || body.body || '').trim();
  const budgetRange = String(body.budgetRange || body.budget || '').trim() || null;
  const timeline = String(body.timeline || '').trim() || null;
  const preferredContactMethod = String(body.preferredContactMethod || body.contactMethod || '').trim() || null;

  if (!REQUEST_TYPES.has(requestType)) {
    throw httpError(`Invalid requestType. Allowed: ${[...REQUEST_TYPES].join(', ')}`);
  }
  if (!SOURCES.has(source)) {
    throw httpError(`Invalid source. Allowed: ${[...SOURCES].join(', ')}`);
  }
  if (!PRIORITIES.has(priority)) {
    throw httpError(`Invalid priority. Allowed: ${[...PRIORITIES].join(', ')}`);
  }
  if (!contactEmail || !contactEmail.includes('@')) {
    throw httpError('A valid contactEmail is required.');
  }
  if (!subject) throw httpError('Subject is required.');
  if (!description) throw httpError('Description is required.');

  const metaIn = safeJson(body.metadata);
  const metadata = {
    ...metaIn,
    ...(body.page ? { page: body.page } : {}),
    ...(body.sourcePath ? { sourcePath: body.sourcePath } : {}),
  };

  return {
    requestType,
    source,
    priority,
    contactName: contactName || contactEmail.split('@')[0],
    contactEmail,
    contactPhone,
    companyName,
    subject: subject.slice(0, 240),
    description: description.slice(0, 8000),
    budgetRange,
    timeline,
    preferredContactMethod,
    userId: extras.userId || body.userId || null,
    organizationId: extras.organizationId || body.organizationId || null,
    assignedAdminId: body.assignedAdminId || null,
    status: extras.status || 'new',
    metadata: JSON.stringify(metadata),
    adminNotes: body.adminNotes ? String(body.adminNotes).slice(0, 8000) : null,
  };
}

export async function createServiceRequest(body = {}, extras = {}) {
  const data = normalizeCreateBody(body, extras);
  let requestNumber = await nextRequestNumber();
  // Rare race: retry once on unique collision
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const row = await prisma.serviceRequest.create({
        data: {
          id: randomUUID(),
          requestNumber,
          ...data,
        },
      });
      if (extras.actorUserId) {
        await writeAuditLog({
          actorUserId: extras.actorUserId,
          action: 'service_request.created',
          entityType: 'service_request',
          entityId: row.id,
          status: 'success',
        }).catch(() => {});
      }
      // Capture contact email into CRM (name + optional linked user id).
      try {
        const { captureContactEmail } = await import('./crmContactsService.js');
        await captureContactEmail({
          email: row.contactEmail,
          name: row.contactName,
          userId: row.userId || null,
          source: 'service_request',
          listType: 'service_requests',
          metadata: {
            serviceRequestId: row.id,
            requestNumber: row.requestNumber,
            companyName: row.companyName || null,
          },
        });
        // If linked to a registered account, also store under Client Accounts.
        if (row.userId) {
          await captureContactEmail({
            email: row.contactEmail,
            name: row.contactName,
            userId: row.userId,
            source: 'service_request_linked',
            listType: 'client_accounts',
          });
        }
      } catch (capErr) {
        console.warn('[service-request] CRM contact capture skipped:', capErr.message);
      }
      return publicServiceRequest(row);
    } catch (err) {
      if (String(err?.code) === 'P2002') {
        requestNumber = await nextRequestNumber();
        continue;
      }
      throw err;
    }
  }
  throw httpError('Could not allocate a request number. Try again.', 500, 'REQUEST_NUMBER_FAILED');
}

export async function listServiceRequests(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit || query.take || 50), 1), 200);
  const offset = Math.max(Number(query.offset || query.skip || 0), 0);
  const status = query.status ? String(query.status).toLowerCase() : '';
  const requestType = query.requestType ? String(query.requestType).toLowerCase().replace(/[\s-]+/g, '_') : '';
  const priority = query.priority ? String(query.priority).toLowerCase() : '';
  const source = query.source ? String(query.source).toLowerCase() : '';
  const assignedAdminId = query.assignedAdminId ? String(query.assignedAdminId) : '';
  const userId = query.userId ? String(query.userId) : '';
  const q = String(query.q || query.query || query.search || '').trim();

  const where = {
    ...(status && status !== 'all' && STATUSES.has(status) ? { status } : {}),
    ...(requestType && REQUEST_TYPES.has(requestType) ? { requestType } : {}),
    ...(priority && PRIORITIES.has(priority) ? { priority } : {}),
    ...(source && SOURCES.has(source) ? { source } : {}),
    ...(assignedAdminId ? { assignedAdminId } : {}),
    ...(userId ? { userId } : {}),
  };

  if (q) {
    where.OR = [
      { requestNumber: { contains: q } },
      { contactName: { contains: q } },
      { contactEmail: { contains: q } },
      { companyName: { contains: q } },
      { subject: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.serviceRequest.count({ where }),
  ]);

  return {
    serviceRequests: rows.map(publicServiceRequest),
    total,
    limit,
    offset,
  };
}

export async function getServiceRequest(id) {
  const row = await prisma.serviceRequest.findUnique({ where: { id: String(id) } });
  if (!row) throw httpError('Service request not found.', 404, 'NOT_FOUND');
  return publicServiceRequest(row);
}

export async function updateServiceRequest(id, patch = {}, actorUserId = null) {
  const existing = await prisma.serviceRequest.findUnique({ where: { id: String(id) } });
  if (!existing) throw httpError('Service request not found.', 404, 'NOT_FOUND');

  const data = {};
  if (patch.status != null) {
    const status = String(patch.status).toLowerCase().replace(/[\s-]+/g, '_');
    if (!STATUSES.has(status)) throw httpError(`Invalid status: ${status}`);
    data.status = status;
  }
  if (patch.priority != null) {
    const priority = String(patch.priority).toLowerCase();
    if (!PRIORITIES.has(priority)) throw httpError(`Invalid priority: ${priority}`);
    data.priority = priority;
  }
  if (patch.requestType != null) {
    const requestType = String(patch.requestType).toLowerCase().replace(/[\s-]+/g, '_');
    if (!REQUEST_TYPES.has(requestType)) throw httpError(`Invalid requestType: ${requestType}`);
    data.requestType = requestType;
  }
  if (patch.assignedAdminId !== undefined) {
    data.assignedAdminId = patch.assignedAdminId ? String(patch.assignedAdminId) : null;
  }
  if (patch.adminNotes !== undefined) {
    data.adminNotes = patch.adminNotes == null ? null : String(patch.adminNotes).slice(0, 8000);
  }
  if (patch.contactName != null) data.contactName = String(patch.contactName).trim().slice(0, 160);
  if (patch.contactEmail != null) data.contactEmail = String(patch.contactEmail).trim().toLowerCase();
  if (patch.contactPhone !== undefined) data.contactPhone = patch.contactPhone ? String(patch.contactPhone).trim() : null;
  if (patch.companyName !== undefined) data.companyName = patch.companyName ? String(patch.companyName).trim() : null;
  if (patch.subject != null) data.subject = String(patch.subject).trim().slice(0, 240);
  if (patch.description != null) data.description = String(patch.description).trim().slice(0, 8000);
  if (patch.budgetRange !== undefined) data.budgetRange = patch.budgetRange ? String(patch.budgetRange) : null;
  if (patch.timeline !== undefined) data.timeline = patch.timeline ? String(patch.timeline) : null;
  if (patch.preferredContactMethod !== undefined) {
    data.preferredContactMethod = patch.preferredContactMethod ? String(patch.preferredContactMethod) : null;
  }
  if (patch.metadata != null) {
    const prev = safeJson(existing.metadata);
    const next = safeJson(patch.metadata);
    data.metadata = JSON.stringify({ ...prev, ...next });
  }
  if (patch.lastContactedAt !== undefined) {
    data.lastContactedAt = patch.lastContactedAt ? new Date(patch.lastContactedAt) : null;
  }

  if (!Object.keys(data).length) return publicServiceRequest(existing);

  const row = await prisma.serviceRequest.update({ where: { id: existing.id }, data });
  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: 'service_request.updated',
      entityType: 'service_request',
      entityId: row.id,
      status: 'success',
      metadata: JSON.stringify(data),
    }).catch(() => {});
  }
  return publicServiceRequest(row);
}

export async function markServiceRequestContacted(id, note, actorUserId = null) {
  const existing = await prisma.serviceRequest.findUnique({ where: { id: String(id) } });
  if (!existing) throw httpError('Service request not found.', 404, 'NOT_FOUND');

  const noteLine = note ? String(note).trim() : '';
  const stamp = new Date().toISOString();
  const prevNotes = existing.adminNotes || '';
  const adminNotes = noteLine
    ? `${prevNotes ? `${prevNotes}\n\n` : ''}[${stamp}] Contacted: ${noteLine}`.slice(0, 8000)
    : existing.adminNotes;

  const row = await prisma.serviceRequest.update({
    where: { id: existing.id },
    data: {
      status: existing.status === 'new' || existing.status === 'reviewing' ? 'contacted' : existing.status,
      lastContactedAt: new Date(),
      adminNotes,
    },
  });

  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: 'service_request.contacted',
      entityType: 'service_request',
      entityId: row.id,
      status: 'success',
    }).catch(() => {});
  }
  return publicServiceRequest(row);
}

/**
 * Convert to a lightweight lead reference (no separate Lead table yet).
 * Stores a stable convertedLeadId and metadata for CRM follow-up.
 */
export async function convertServiceRequestToLead(id, actorUserId = null) {
  const existing = await prisma.serviceRequest.findUnique({ where: { id: String(id) } });
  if (!existing) throw httpError('Service request not found.', 404, 'NOT_FOUND');
  if (existing.convertedLeadId) {
    return publicServiceRequest(existing);
  }

  const leadId = randomUUID();
  const meta = safeJson(existing.metadata);
  meta.lead = {
    id: leadId,
    convertedAt: new Date().toISOString(),
    convertedBy: actorUserId || null,
    contactName: existing.contactName,
    contactEmail: existing.contactEmail,
    requestType: existing.requestType,
    subject: existing.subject,
  };

  const row = await prisma.serviceRequest.update({
    where: { id: existing.id },
    data: {
      convertedLeadId: leadId,
      metadata: JSON.stringify(meta),
      status: ['new', 'reviewing', 'contacted'].includes(existing.status) ? 'quoted' : existing.status,
    },
  });

  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: 'service_request.converted_to_lead',
      entityType: 'service_request',
      entityId: row.id,
      status: 'success',
      metadata: JSON.stringify({ leadId }),
    }).catch(() => {});
  }
  return publicServiceRequest(row);
}

/**
 * Escalate intake into a real support Ticket (separate system).
 */
export async function convertServiceRequestToTicket(id, actorUserId = null) {
  const existing = await prisma.serviceRequest.findUnique({ where: { id: String(id) } });
  if (!existing) throw httpError('Service request not found.', 404, 'NOT_FOUND');
  if (existing.convertedTicketId) {
    return publicServiceRequest(existing);
  }

  const categoryMap = {
    consultation: 'general',
    website_build: 'hosting',
    domain: 'domain',
    hosting: 'hosting',
    vps: 'vps',
    email: 'email',
    migration: 'hosting',
    ai_automation: 'general',
    custom: 'general',
  };

  const ticketOwnerId = existing.userId || actorUserId;
  if (!ticketOwnerId) {
    throw httpError('Cannot convert to ticket without a customer or admin user id.', 400, 'NO_USER');
  }

  const ticket = await createTicket(ticketOwnerId, {
    subject: `[SR ${existing.requestNumber}] ${existing.subject}`,
    category: categoryMap[existing.requestType] || 'general',
    priority: existing.priority || 'normal',
    organizationId: existing.organizationId || null,
    body: [
      `Converted from Service Request ${existing.requestNumber}.`,
      `Contact: ${existing.contactName} <${existing.contactEmail}>`,
      existing.contactPhone ? `Phone: ${existing.contactPhone}` : null,
      existing.companyName ? `Company: ${existing.companyName}` : null,
      `Type: ${existing.requestType}`,
      '',
      existing.description,
    ].filter(Boolean).join('\n'),
  });

  const meta = safeJson(existing.metadata);
  meta.ticket = {
    id: ticket.id,
    convertedAt: new Date().toISOString(),
    convertedBy: actorUserId || null,
  };

  const row = await prisma.serviceRequest.update({
    where: { id: existing.id },
    data: {
      convertedTicketId: ticket.id,
      metadata: JSON.stringify(meta),
    },
  });

  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: 'service_request.converted_to_ticket',
      entityType: 'service_request',
      entityId: row.id,
      status: 'success',
      metadata: JSON.stringify({ ticketId: ticket.id }),
    }).catch(() => {});
  }
  return publicServiceRequest(row);
}

export async function deleteServiceRequest(id, actorUserId = null) {
  const existing = await prisma.serviceRequest.findUnique({ where: { id: String(id) } });
  if (!existing) throw httpError('Service request not found.', 404, 'NOT_FOUND');
  await prisma.serviceRequest.delete({ where: { id: existing.id } });
  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: 'service_request.deleted',
      entityType: 'service_request',
      entityId: existing.id,
      status: 'success',
    }).catch(() => {});
  }
  return { ok: true, id: existing.id };
}
