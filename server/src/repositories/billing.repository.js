/**
 * billing.repository.js
 *
 * Database gateway for the admin billing view of one customer: orders,
 * receipts, subscriptions, invoices (+ line items), credit notes and payment
 * methods. Read-only — billing writes stay with their owning services.
 */

import { prisma } from '../services/db.js';

export async function listOrdersByUser(userId, { limit = 200 } = {}) {
  return prisma.checkoutOrder.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
  });
}

export async function listReceiptsByUser(userId, { limit = 200 } = {}) {
  const rows = await prisma.paymentReceipt.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
  });
  // Never expose raw disk paths outside the server.
  return rows.map(({ filePath, ...rest }) => rest);
}

export async function listSubscriptionsByUser(userId, { limit = 100 } = {}) {
  return prisma.deploymentSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
  });
}

export async function listInvoicesByUser(userId, organizationIds = [], { limit = 100 } = {}) {
  return prisma.invoice.findMany({
    where: {
      OR: [
        { userId },
        ...(organizationIds.length ? [{ organizationId: { in: organizationIds } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
    include: { lineItems: true },
  });
}

export async function listCreditNotesByUser(userId, organizationIds = [], { limit = 100 } = {}) {
  return prisma.creditNote.findMany({
    where: {
      OR: [
        { userId },
        ...(organizationIds.length ? [{ organizationId: { in: organizationIds } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
  });
}

export async function listPaymentMethodsByUser(userId, organizationIds = []) {
  const rows = await prisma.paymentMethod.findMany({
    where: {
      OR: [
        { userId },
        ...(organizationIds.length ? [{ organizationId: { in: organizationIds } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  // providerMethodId and metadata can carry provider tokens — admins only see
  // the display-safe surface.
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    methodType: r.methodType,
    brand: r.brand,
    last4: r.last4,
    expiryMonth: r.expiryMonth,
    expiryYear: r.expiryYear,
    isDefault: r.isDefault,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

export function listAdminDeploymentOrders({ limit = 500, select = null } = {}) {
  return prisma.checkoutOrder.findMany({
    where: { type: 'deployment' },
    ...(select ? { select } : {}),
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
  });
}

export function countPendingReceipts() {
  return prisma.paymentReceipt.count({ where: { status: 'pending' } });
}

export function countDeploymentCleanupJobs() {
  return prisma.deploymentCleanupJob.count();
}

export function listAdminReceipts({ limit = 500 } = {}) {
  return prisma.paymentReceipt.findMany({
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
    include: { checkoutOrder: { select: { id: true, status: true, deploymentId: true, userId: true, totalAmountCents: true, currency: true } } },
  });
}

export function findReceiptWithOrder(receiptId) {
  return prisma.paymentReceipt.findUnique({ where: { id: receiptId }, include: { checkoutOrder: true } });
}

export function updateReceipt(receiptId, data) {
  return prisma.paymentReceipt.update({ where: { id: receiptId }, data });
}

export function updateOrder(orderId, data) {
  return prisma.checkoutOrder.update({ where: { id: orderId }, data });
}

export function findOrderById(orderId) {
  return prisma.checkoutOrder.findUnique({ where: { id: orderId } });
}

export function deleteOrderById(orderId) {
  return prisma.checkoutOrder.delete({ where: { id: orderId } });
}
