/**
 * audit.repository.js
 *
 * Database gateway for the admin activity view of one customer: audit logs
 * where the customer acted or was acted upon, plus admin commands that
 * targeted them. Read-only — writes stay in auditLogService.
 */

import { prisma } from '../services/db.js';

export async function listAuditForCustomer(userId, organizationIds = [], { limit = 50, offset = 0 } = {}) {
  const where = {
    OR: [
      { actorUserId: userId },
      { entityId: userId },
      ...(organizationIds.length ? [{ organizationId: { in: organizationIds } }] : []),
    ],
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, limit: Number(limit), offset: Number(offset) };
}

/** Admin commands whose metadata references the customer (best-effort match). */
export async function listAdminCommandsForCustomer(userId, { limit = 50 } = {}) {
  return prisma.adminCommand.findMany({
    where: {
      OR: [
        { metadata: { contains: userId } },
        { beforeState: { contains: userId } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
  });
}
