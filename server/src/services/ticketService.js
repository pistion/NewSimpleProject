/**
 * ticketService.js — customer support ticket CRUD + admin management.
 */

import { prisma } from './db.js';
import { writeAuditLog } from './auditLogService.js';

function httpError(msg, status = 400) {
  return Object.assign(new Error(msg), { status, expose: true });
}

const VALID_CATEGORIES = new Set(['billing', 'hosting', 'domain', 'vps', 'email', 'account', 'complaint', 'general']);
const VALID_PRIORITIES  = new Set(['low', 'normal', 'high', 'urgent']);

// ── Customer helpers ──────────────────────────────────────────────────────────

export async function createTicket(userId, { subject, category = 'general', priority = 'normal', relatedServiceType, relatedServiceId, organizationId, body }) {
  if (!subject?.trim()) throw httpError('Subject is required.');
  if (!VALID_CATEGORIES.has(category)) throw httpError(`Invalid category: ${category}`);
  if (!VALID_PRIORITIES.has(priority))  throw httpError(`Invalid priority: ${priority}`);

  const ticket = await prisma.ticket.create({
    data: {
      userId, organizationId: organizationId || null,
      category, priority, status: 'open',
      subject: subject.trim(),
      relatedServiceType: relatedServiceType || null,
      relatedServiceId:   relatedServiceId || null,
    },
  });

  if (body?.trim()) {
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderUserId: userId,
        senderRole: 'customer',
        body: body.trim(),
      },
    });
  }

  await writeAuditLog({ actorUserId: userId, action: 'ticket.created', entityType: 'ticket', entityId: ticket.id, status: 'success' });
  return ticket;
}

export async function listUserTickets(userId, { limit = 20, offset = 0, status } = {}) {
  const where = { userId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    prisma.ticket.findMany({ where, orderBy: { createdAt: 'desc' }, take: Number(limit), skip: Number(offset) }),
    prisma.ticket.count({ where }),
  ]);
  return { items, total, limit: Number(limit), offset: Number(offset) };
}

export async function getTicket(ticketId, userId, isAdmin = false) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) throw httpError('Ticket not found.', 404);
  if (!isAdmin && ticket.userId !== userId) throw httpError('Ticket not found.', 404);
  return ticket;
}

export async function addTicketMessage(ticketId, userId, body, isAdmin = false) {
  if (!body?.trim()) throw httpError('Message body is required.');

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw httpError('Ticket not found.', 404);
  if (!isAdmin && ticket.userId !== userId) throw httpError('Ticket not found.', 404);
  if (['closed'].includes(ticket.status)) throw httpError('Cannot reply to a closed ticket.');

  const senderRole = isAdmin ? 'admin' : 'customer';
  const newStatus  = isAdmin ? 'pending_customer' : 'pending_admin';

  const [message] = await Promise.all([
    prisma.ticketMessage.create({
      data: { ticketId, senderUserId: userId, senderRole, body: body.trim() },
    }),
    prisma.ticket.update({ where: { id: ticketId }, data: { status: newStatus, updatedAt: new Date() } }),
  ]);

  await writeAuditLog({ actorUserId: userId, action: 'ticket.message_added', entityType: 'ticket', entityId: ticketId, status: 'success' });
  return message;
}

// ── Admin helpers ─────────────────────────────────────────────────────────────

export async function listAllTickets({ limit = 30, offset = 0, status, category, priority, userId: filterUserId } = {}) {
  const where = {
    ...(status       ? { status }           : {}),
    ...(category     ? { category }         : {}),
    ...(priority     ? { priority }         : {}),
    ...(filterUserId ? { userId: filterUserId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.ticket.findMany({ where, orderBy: { updatedAt: 'desc' }, take: Number(limit), skip: Number(offset) }),
    prisma.ticket.count({ where }),
  ]);
  return { items, total, limit: Number(limit), offset: Number(offset) };
}

export async function adminUpdateTicket(ticketId, adminUserId, { status, priority, assignedAdminId }) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw httpError('Ticket not found.', 404);

  const data = {};
  if (status)   { data.status = status; if (status === 'closed') data.closedAt = new Date(); }
  if (priority) data.priority = priority;
  if (assignedAdminId !== undefined) data.assignedAdminId = assignedAdminId;

  const updated = await prisma.ticket.update({ where: { id: ticketId }, data });
  await writeAuditLog({ actorUserId: adminUserId, action: 'admin.ticket_updated', entityType: 'ticket', entityId: ticketId, status: 'success', metadata: JSON.stringify(data) });
  return updated;
}
