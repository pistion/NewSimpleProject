import { prisma } from '../services/db.js';

export async function listDashboardWarnings({ limit = 50, offset = 0, status, warningType } = {}) {
  const where = {
    ...(status ? { status } : { status: { not: 'dismissed' } }),
    ...(warningType ? { warningType } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.dashboardWarning.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    }),
    prisma.dashboardWarning.count({ where }),
  ]);
  return { items, total, limit: Number(limit), offset: Number(offset) };
}

export function dismissDashboardWarning(id, adminUserId) {
  return prisma.dashboardWarning.update({
    where: { id },
    data: { status: 'dismissed', dismissedByAdmin: adminUserId, dismissedAt: new Date() },
  });
}

export function findDashboardWarning(id) {
  return prisma.dashboardWarning.findUnique({ where: { id } });
}

export function createWatchdogEvent(data) {
  return prisma.watchdogEvent.create({ data });
}

export function updateDashboardWarning(id, data) {
  return prisma.dashboardWarning.update({ where: { id }, data });
}

export async function listWatchdogEvents({ limit = 50, offset = 0, status, severity } = {}) {
  const where = {
    ...(status ? { status } : { status: { not: 'dismissed' } }),
    ...(severity ? { severity } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.watchdogEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    }),
    prisma.watchdogEvent.count({ where }),
  ]);
  return { items, total, limit: Number(limit), offset: Number(offset) };
}

export function updateWatchdogEvent(id, data) {
  return prisma.watchdogEvent.update({ where: { id }, data });
}

export async function listAdminCommands({ limit = 50, offset = 0, adminUserId, commandType } = {}) {
  const where = {
    ...(adminUserId ? { adminUserId } : {}),
    ...(commandType ? { commandType } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.adminCommand.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    }),
    prisma.adminCommand.count({ where }),
  ]);
  return { items, total, limit: Number(limit), offset: Number(offset) };
}

export function listAdminPolicies() {
  return prisma.adminPolicy.findMany({ orderBy: { policyKey: 'asc' } });
}

export function findAdminPolicy(policyKey) {
  return prisma.adminPolicy.findUnique({ where: { policyKey } });
}

export async function upsertAdminPolicy(policyKey, { valueJson, category, description, enabled, adminUserId }) {
  const before = await findAdminPolicy(policyKey);
  const policy = await prisma.adminPolicy.upsert({
    where: { policyKey },
    update: {
      valueJson: String(valueJson),
      ...(description !== undefined ? { description } : {}),
      ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
      updatedByAdminId: adminUserId,
    },
    create: {
      policyKey,
      category: category || 'dashboard',
      valueJson: String(valueJson),
      description: description || null,
      updatedByAdminId: adminUserId,
    },
  });

  await prisma.adminCommand.create({
    data: {
      adminUserId,
      commandType: 'policy.updated',
      beforeState: before ? JSON.stringify({ valueJson: before.valueJson }) : '{}',
      afterState: JSON.stringify({ valueJson: String(valueJson) }),
      metadata: JSON.stringify({ policyKey }),
    },
  });

  return policy;
}
