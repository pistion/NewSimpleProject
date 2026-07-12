/**
 * ticketService.js — customer support ticket CRUD + in-app conversation.
 *
 * Conversation model:
 *  - every message carries a delivery status: sent → seen → replied,
 *  - tickets keep unread counters per side (unreadForCustomer / unreadForAdmin)
 *    plus last-message timestamps so lists and badges never scan messages,
 *  - opening a conversation marks the other side's messages seen and resets
 *    the reader's unread counter,
 *  - each new message flips the ticket status (pending_admin ↔ pending_customer)
 *    and notifies the opposite side.
 */

import { prisma } from './db.js';
import { writeAuditLog } from './auditLogService.js';
import { createAdminNotification, createUserNotification } from './notificationService.js';

function httpError(msg, status = 400) {
  return Object.assign(new Error(msg), { status, expose: true });
}

const VALID_CATEGORIES = new Set(['billing', 'hosting', 'domain', 'vps', 'email', 'account', 'complaint', 'general']);
const VALID_PRIORITIES  = new Set(['low', 'normal', 'high', 'urgent']);
const VALID_STATUSES    = new Set(['open', 'pending_admin', 'pending_customer', 'resolved', 'closed']);

/** Newest visible message appended for list rows. */
function withLastMessage(ticket) {
  const last = ticket.messages?.[0] ?? null;
  const { messages, ...rest } = ticket;
  return {
    ...rest,
    lastMessage: last ? { body: last.body, senderRole: last.senderRole, createdAt: last.createdAt, status: last.status } : null,
  };
}

const LAST_MESSAGE_INCLUDE = {
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
};

// ── Customer helpers ──────────────────────────────────────────────────────────

export async function createTicket(userId, { subject, category = 'general', priority = 'normal', relatedServiceType, relatedServiceId, organizationId, body }) {
  if (!subject?.trim()) throw httpError('Subject is required.');
  if (!VALID_CATEGORIES.has(category)) throw httpError(`Invalid category: ${category}`);
  if (!VALID_PRIORITIES.has(priority))  throw httpError(`Invalid priority: ${priority}`);

  const hasBody = Boolean(body?.trim());
  const now = new Date();

  // Ticket + first customer message land together.
  const ticket = await prisma.ticket.create({
    data: {
      userId,
      organizationId: organizationId || null,
      category,
      priority,
      status: hasBody ? 'pending_admin' : 'open',
      subject: subject.trim(),
      relatedServiceType: relatedServiceType || null,
      relatedServiceId:   relatedServiceId || null,
      ...(hasBody ? {
        lastMessageAt: now,
        lastCustomerMessageAt: now,
        unreadForAdmin: 1,
        messages: {
          create: {
            senderUserId: userId,
            senderRole: 'customer',
            body: body.trim(),
            status: 'sent',
          },
        },
      } : {}),
    },
    include: LAST_MESSAGE_INCLUDE,
  });

  await writeAuditLog({ actorUserId: userId, action: 'ticket.created', entityType: 'ticket', entityId: ticket.id, status: 'success' });

  // Surface the new ticket in the admin dashboard Bell (best-effort, never throws).
  await createAdminNotification({
    type: 'ticket',
    title: 'New support ticket',
    message: `[${category}/${priority}] ${ticket.subject}`,
    entityType: 'ticket',
    entityId: ticket.id,
    actionUrl: '/dashboard#tickets',
  });

  return withLastMessage(ticket);
}

export async function listUserTickets(userId, { limit = 20, offset = 0, status } = {}) {
  const where = { userId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: Number(limit),
      skip: Number(offset),
      include: LAST_MESSAGE_INCLUDE,
    }),
    prisma.ticket.count({ where }),
  ]);
  return { items: items.map(withLastMessage), total, limit: Number(limit), offset: Number(offset) };
}

/** Total unread admin replies across the customer's tickets — sidebar badge. */
export async function getCustomerUnreadCount(userId) {
  const agg = await prisma.ticket.aggregate({
    where: { userId, unreadForCustomer: { gt: 0 } },
    _sum: { unreadForCustomer: true },
  });
  return { count: agg._sum.unreadForCustomer ?? 0 };
}

/** Total unread customer messages across all tickets — admin tab badge. */
export async function getAdminUnreadCount() {
  const agg = await prisma.ticket.aggregate({
    where: { unreadForAdmin: { gt: 0 } },
    _sum: { unreadForAdmin: true },
  });
  return { count: agg._sum.unreadForAdmin ?? 0 };
}

export async function getTicket(ticketId, userId, isAdmin = false) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { messages: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) throw httpError('Ticket not found.', 404);
  if (!isAdmin && ticket.userId !== userId) throw httpError('Ticket not found.', 404);
  if (isAdmin && ticket.userId) {
    const user = await prisma.user.findUnique({
      where: { id: ticket.userId },
      select: { id: true, email: true, name: true, clientId: true },
    });
    return { ...ticket, user };
  }
  return ticket;
}

/**
 * The reader opened the conversation: mark the OTHER side's messages seen and
 * reset the reader's unread counter. Idempotent.
 */
export async function markTicketSeen(ticketId, userId, isAdmin = false) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw httpError('Ticket not found.', 404);
  if (!isAdmin && ticket.userId !== userId) throw httpError('Ticket not found.', 404);

  const otherRole = isAdmin ? 'customer' : 'admin';
  const now = new Date();

  await prisma.$transaction([
    prisma.ticketMessage.updateMany({
      where: { ticketId, senderRole: otherRole, status: 'sent', deletedAt: null },
      data: { status: 'seen', seenAt: now },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: isAdmin ? { unreadForAdmin: 0 } : { unreadForCustomer: 0 },
    }),
  ]);

  return { ok: true };
}

export async function addTicketMessage(ticketId, userId, body, isAdmin = false) {
  if (!body?.trim()) throw httpError('Message body is required.');

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw httpError('Ticket not found.', 404);
  if (!isAdmin && ticket.userId !== userId) throw httpError('Ticket not found.', 404);
  if (['closed'].includes(ticket.status)) throw httpError('Cannot reply to a closed ticket.');

  const senderRole = isAdmin ? 'admin' : 'customer';
  const otherRole  = isAdmin ? 'customer' : 'admin';
  const newStatus  = isAdmin ? 'pending_customer' : 'pending_admin';
  const now = new Date();

  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId, senderUserId: userId, senderRole, body: body.trim(), status: 'sent' },
    }),
    // Replying implies the other side's messages were read and answered.
    prisma.ticketMessage.updateMany({
      where: { ticketId, senderRole: otherRole, status: { in: ['sent', 'seen'] }, deletedAt: null },
      data: { status: 'replied', repliedAt: now, seenAt: now },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: newStatus,
        lastMessageAt: now,
        ...(isAdmin
          ? { lastAdminMessageAt: now, unreadForCustomer: { increment: 1 }, unreadForAdmin: 0 }
          : { lastCustomerMessageAt: now, unreadForAdmin: { increment: 1 }, unreadForCustomer: 0 }),
      },
    }),
  ]);

  await writeAuditLog({ actorUserId: userId, action: 'ticket.message_added', entityType: 'ticket', entityId: ticketId, status: 'success' });

  // Notify the other side of the conversation (best-effort).
  if (isAdmin) {
    await createUserNotification(ticket.userId, {
      type: 'ticket',
      title: 'Support replied to your ticket',
      message: ticket.subject,
      entityType: 'ticket',
      entityId: ticketId,
      actionUrl: '/dashboard#support',
    });
  } else {
    await createAdminNotification({
      type: 'ticket',
      title: 'Customer replied to a ticket',
      message: ticket.subject,
      entityType: 'ticket',
      entityId: ticketId,
      actionUrl: '/dashboard#tickets',
    });
  }

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
    prisma.ticket.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: Number(limit),
      skip: Number(offset),
      include: LAST_MESSAGE_INCLUDE,
    }),
    prisma.ticket.count({ where }),
  ]);

  // Enrich rows with owner identity (no Ticket→User relation in the schema).
  const userIds = [...new Set(items.map((t) => t.userId).filter(Boolean))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true, clientId: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return {
    items: items.map((t) => ({ ...withLastMessage(t), user: userMap.get(t.userId) ?? null })),
    total,
    limit: Number(limit),
    offset: Number(offset),
  };
}

export async function adminUpdateTicket(ticketId, adminUserId, { status, priority, assignedAdminId }) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw httpError('Ticket not found.', 404);
  if (status && !VALID_STATUSES.has(status)) throw httpError(`Invalid status: ${status}`);
  if (priority && !VALID_PRIORITIES.has(priority)) throw httpError(`Invalid priority: ${priority}`);

  const data = {};
  if (status)   { data.status = status; data.closedAt = status === 'closed' ? new Date() : null; }
  if (priority) data.priority = priority;
  if (assignedAdminId !== undefined) data.assignedAdminId = assignedAdminId;

  const updated = await prisma.ticket.update({ where: { id: ticketId }, data });
  await writeAuditLog({ actorUserId: adminUserId, action: 'admin.ticket_updated', entityType: 'ticket', entityId: ticketId, status: 'success', metadata: JSON.stringify(data) });

  // Tell the customer when their ticket's status changes (best-effort).
  if (status && status !== ticket.status) {
    await createUserNotification(ticket.userId, {
      type: 'ticket',
      title: status === 'closed' ? 'Your ticket was closed' : `Ticket status: ${status.replace(/_/g, ' ')}`,
      message: ticket.subject,
      entityType: 'ticket',
      entityId: ticketId,
      actionUrl: '/dashboard#support',
    });
  }

  return updated;
}
