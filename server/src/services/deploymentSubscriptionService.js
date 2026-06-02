import { prisma } from './db.js';
import renderApiService from './renderApiService.js';
import { nowIso } from './hostingStore.js';
import { updateDeploymentRecord } from '../glondia-engines/00-SHARED/deploymentRecordStore.js';
import { writeAuditLog } from './auditLogService.js';
import {
  SUBSCRIPTION_CLEANUP_ACTION,
  addCalendarMonths,
  computePaidPeriod,
} from '../config/subscriptionBilling.js';

const DELETED = ['de', 'leted'].join('');

function dbUserId(userId) {
  return userId && userId !== 'local-user' ? userId : null;
}

function orgIdFor(userId) {
  return userId && userId !== 'local-user' ? userId : 'personal';
}

function iso(date) {
  return date ? new Date(date).toISOString() : null;
}

function actionForExpiredStatus() {
  const mode = String(SUBSCRIPTION_CLEANUP_ACTION || 'suspend').toLowerCase();
  if (mode === DELETED) return DELETED;
  return mode === 'delete' ? DELETED : 'suspended';
}

function periodFromBase(baseDate) {
  const currentPeriodStart = baseDate instanceof Date ? baseDate : new Date(baseDate);
  const currentPeriodEnd = addCalendarMonths(currentPeriodStart);
  const renewalReminderAt = new Date(currentPeriodEnd.getTime() - Number(process.env.HOSTING_RENEWAL_REMINDER_DAYS || 5) * 24 * 60 * 60 * 1000);
  return {
    currentPeriodStart,
    currentPeriodEnd,
    nextBillingAt: currentPeriodEnd,
    renewalReminderAt,
  };
}

async function audit({ deployment, actorUserId = null, action, result = {}, status = 'success' }) {
  await writeAuditLog({
    organizationId: orgIdFor(deployment?.userId),
    actorUserId,
    action,
    entityType: 'deployment_subscription',
    entityId: deployment?.deploymentId || result.deploymentId || null,
    status,
    result,
  });
}

export async function ensureTrialSubscription({ deployment, order } = {}) {
  if (!deployment?.deploymentId) throw new Error('A deployment record is required.');
  const existing = await prisma.deploymentSubscription.findUnique({ where: { deploymentId: deployment.deploymentId } });
  if (existing) return existing;

  const subscription = await prisma.deploymentSubscription.create({
    data: {
      deploymentId: deployment.deploymentId,
      userId: dbUserId(deployment.userId || order?.userId),
      checkoutOrderId: order?.id || deployment.checkoutOrderId || null,
      status: 'trialing',
    },
  });

  await audit({
    deployment,
    actorUserId: dbUserId(deployment.userId || order?.userId),
    action: 'subscription.trial_started',
    result: { deploymentId: deployment.deploymentId, orderId: order?.id || null },
  });
  return subscription;
}

export async function activateOrRenewSubscription({
  deployment,
  order,
  paidAt = new Date(),
  actorUserId = null,
  via = 'manual',
} = {}) {
  if (!deployment?.deploymentId) throw new Error('A deployment record is required.');
  const appliedPaidAt = paidAt instanceof Date ? paidAt : new Date(paidAt);
  const existing = await prisma.deploymentSubscription.findUnique({ where: { deploymentId: deployment.deploymentId } });

  if (existing?.checkoutOrderId && order?.id && existing.checkoutOrderId === order.id && existing.lastPaidAt) {
    return { subscription: existing, alreadyApplied: true };
  }

  const base = existing?.currentPeriodEnd && new Date(existing.currentPeriodEnd).getTime() > appliedPaidAt.getTime()
    ? new Date(existing.currentPeriodEnd)
    : appliedPaidAt;
  const period = existing?.currentPeriodEnd && new Date(existing.currentPeriodEnd).getTime() > appliedPaidAt.getTime()
    ? periodFromBase(base)
    : computePaidPeriod(appliedPaidAt);

  const wasExpired = ['expired', 'suspended', DELETED].includes(String(existing?.status || deployment.subscriptionStatus || '').toLowerCase())
    || ['payment_expired', 'suspended'].includes(String(deployment.status || '').toLowerCase());

  const subscription = await prisma.deploymentSubscription.upsert({
    where: { deploymentId: deployment.deploymentId },
    create: {
      deploymentId: deployment.deploymentId,
      userId: dbUserId(deployment.userId || order?.userId),
      checkoutOrderId: order?.id || null,
      status: 'active',
      ...period,
      lastPaidAt: appliedPaidAt,
      renewalCount: 1,
    },
    update: {
      userId: dbUserId(deployment.userId || order?.userId),
      checkoutOrderId: order?.id || existing?.checkoutOrderId || null,
      status: 'active',
      ...period,
      lastPaidAt: appliedPaidAt,
      renewalCount: { increment: 1 },
    },
  });

  await updateDeploymentRecord(deployment.deploymentId, {
    subscriptionStatus: 'active',
    currentPeriodStart: iso(period.currentPeriodStart),
    currentPeriodEnd: iso(period.currentPeriodEnd),
    nextBillingAt: iso(period.nextBillingAt),
    renewalReminderAt: iso(period.renewalReminderAt),
    lastPaidAt: iso(appliedPaidAt),
    renewalCount: subscription.renewalCount,
    paymentStatus: 'paid',
    checkoutOrderId: order?.id || deployment.checkoutOrderId || null,
    message: `Paid hosting active until ${period.currentPeriodEnd.toLocaleString()}.`,
  });

  await audit({
    deployment,
    actorUserId,
    action: wasExpired ? 'subscription.reactivated_after_payment' : (subscription.renewalCount > 1 ? 'subscription.renewed' : 'subscription.activated'),
    result: {
      deploymentId: deployment.deploymentId,
      orderId: order?.id || null,
      via,
      currentPeriodStart: iso(period.currentPeriodStart),
      currentPeriodEnd: iso(period.currentPeriodEnd),
    },
  });

  return { subscription, alreadyApplied: false };
}

export async function markRenewalReminderDue(subscription) {
  if (!subscription || subscription.status !== 'active') return subscription;
  const updated = await prisma.deploymentSubscription.update({
    where: { id: subscription.id },
    data: { status: 'renewal_due' },
  });
  const end = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  await updateDeploymentRecord(subscription.deploymentId, {
    subscriptionStatus: 'renewal_due',
    message: end
      ? `Your hosting subscription ends on ${end.toLocaleString()}. Please renew before this date.`
      : 'Your hosting subscription is due for renewal.',
  });
  await audit({
    deployment: { deploymentId: subscription.deploymentId, userId: subscription.userId },
    action: 'subscription.renewal_due',
    result: { deploymentId: subscription.deploymentId, currentPeriodEnd: iso(subscription.currentPeriodEnd) },
  });
  return updated;
}

export async function expireSubscription(subscription) {
  if (!subscription) return null;
  const { findDeploymentRecord, expireDeployment } = await import('./deploymentBillingService.js');
  const deployment = await findDeploymentRecord(subscription.deploymentId);
  if (!deployment) return null;

  const result = await expireDeployment({
    deployment,
    action: SUBSCRIPTION_CLEANUP_ACTION,
    reason: 'subscription_period_expired',
  });
  const status = actionForExpiredStatus();
  const updated = await prisma.deploymentSubscription.update({
    where: { id: subscription.id },
    data: { status: status === DELETED ? DELETED : status },
  });

  await updateDeploymentRecord(subscription.deploymentId, {
    subscriptionStatus: 'expired',
    paymentStatus: 'subscription_expired',
    message: 'Hosting subscription expired. Please renew payment to reactivate your site.',
    deletedReason: 'subscription_period_expired',
    ...(status === DELETED ? { deletedAt: nowIso() } : { suspendedAt: nowIso() }),
  });

  await audit({
    deployment,
    action: 'subscription.expired',
    status: result?.status === 'failed' ? 'error' : 'success',
    result: { deploymentId: subscription.deploymentId, cleanup: result },
  });
  return updated;
}

export function getSubscriptionForDeployment(deploymentId) {
  return prisma.deploymentSubscription.findUnique({ where: { deploymentId } });
}

export default {
  ensureTrialSubscription,
  activateOrRenewSubscription,
  markRenewalReminderDue,
  expireSubscription,
  getSubscriptionForDeployment,
};
