/**
 * adminService.js — read + moderation helpers for the simple admin surface.
 *
 * Admins can see all users, deployments, orders and receipts, approve/reject
 * manual receipts, mark deployments paid, and delete/suspend deployments.
 * Deployments are read from the JSON hosting store; everything else is Prisma.
 */
import { prisma } from './db.js';
import { readHostingStore, mutateHostingStore, nowIso } from './hostingStore.js';
import { writeAuditLog } from './auditLogService.js';
import renderApiService from './renderApiService.js';
import {
  findDeploymentRecord,
  getOrderForDeployment,
  markDeploymentPaid,
  expireDeployment,
  createDeploymentRenewalOrder,
} from './deploymentBillingService.js';
import { updateDeploymentRecord } from '../glondia-engines/00-SHARED/deploymentRecordStore.js';
import { getPromoUsage } from './deploymentPromoService.js';
import { syncServiceAccessOnPayment } from './serviceAccessService.js';
import { createUserNotification } from './notificationService.js';
import { archiveGeneratedSiteFolder } from '../glondia-engines/01-HOSTING-DEPLOY-ENGINE/03-GITHUB-SOURCE-MOUNTAIN/generatedSiteRepoCleanup.stage.js';

const VALID_ROLES = new Set(['owner', 'admin', 'member']);
const VALID_ACCOUNT_STATUS = new Set(['active', 'suspended', 'disabled', 'deleted']);
const VALID_RENDER_PLANS = new Set(['free', 'starter', 'standard']);

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status, expose: true });
}

/** Public, path-free shape of a user record (never exposes passwordHash / raw idPhotoPath). */
function userView(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name || null,
    phone: u.phone || null,
    role: u.role,
    planId: u.planId,
    accountStatus: u.accountStatus || 'active',
    profileDetails: safeJson(u.profileDetails),
    // Avatar/ID photo are served through authenticated admin routes — never the
    // raw SSD path. hasAvatar/avatarUrl drive the admin UI display.
    hasAvatar: Boolean(u.avatarPath),
    avatarUrl: u.avatarPath ? `/api/admin/users/${u.id}/avatar` : null,
    hasIdPhoto: Boolean(u.idPhotoPath),
    disabledAt: u.disabledAt || null,
    disabledReason: u.disabledReason || null,
    deletedAt: u.deletedAt || null,
    reactivatedAt: u.reactivatedAt || null,
    // Launch promo lifecycle (admin visibility).
    promoEligible: u.promoEligible === true,
    promoSignupRank: u.promoSignupRank ?? null,
    promoClaimedAt: u.promoClaimedAt || null,
    promoClaimedOrderId: u.promoClaimedOrderId || null,
    promoClaimedDeploymentId: u.promoClaimedDeploymentId || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/** Strip the raw SSD filePath out of a receipt row before it leaves the server. */
function receiptListView(r) {
  if (!r) return null;
  const { filePath, ...rest } = r;
  return rest;
}

/** Revoke all live refresh tokens for a user (forces re-login / logout everywhere). */
async function revokeUserRefreshTokens(userId) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function deploymentView(d, orderByDeployment = {}) {
  const order = d.checkoutOrderId ? orderByDeployment[d.checkoutOrderId] : orderByDeployment[`dep:${d.deploymentId}`];
  return {
    deploymentId: d.deploymentId,
    userId: d.userId || null,
    serviceName: d.serviceName || null,
    source: d.source || null,
    status: d.status || null,
    paymentStatus: d.paymentStatus || 'none',
    billingDueAt: d.billingDueAt || null,
    trialStartedAt: d.trialStartedAt || null,
    trialEndsAt: d.trialEndsAt || d.billingDueAt || null,
    subscriptionStatus: d.subscriptionStatus || null,
    currentPeriodStart: d.currentPeriodStart || null,
    currentPeriodEnd: d.currentPeriodEnd || null,
    nextBillingAt: d.nextBillingAt || null,
    renewalReminderAt: d.renewalReminderAt || null,
    lastPaidAt: d.lastPaidAt || null,
    renewalCount: d.renewalCount ?? null,
    paidAt: d.paidAt || null,
    deletedReason: d.deletedReason || null,
    checkoutOrderId: d.checkoutOrderId || null,
    renderServiceId: d.renderServiceId || null,
    serviceType: d.serviceType || null,
    liveUrl: d.liveUrl || null,
    platformDeployed: d.platformDeployed === true,
    // Launch pricing + Render plan lifecycle.
    billingTierId: d.billingTierId || (order ? safeJson(order.metadata).billingTierId : null) || null,
    billingTierLabel: d.billingTierLabel || (order ? safeJson(order.metadata).billingTierLabel : null) || null,
    priceCents: d.priceCents ?? (order ? order.totalAmountCents : null) ?? null,
    priceCurrency: d.priceCurrency || (order ? order.currency : null) || null,
    renderPlan: d.renderPlan || null,
    renderPlanTargetAfterPayment: d.renderPlanTargetAfterPayment || (order ? safeJson(order.metadata).renderPlanAfterPayment : null) || null,
    renderPlanUpgradeStatus: d.renderPlanUpgradeStatus || null,
    renderPlanUpgradedAt: d.renderPlanUpgradedAt || null,
    renderPlanChangedAt: d.renderPlanChangedAt || null,
    message: d.message || null,
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null,
    order: order ? { id: order.id, status: order.status, totalAmountCents: order.totalAmountCents, currency: order.currency } : null,
  };
}

async function loadDeployments() {
  const store = await readHostingStore();
  // Return ALL deployments so the admin hosting section can show pending/failed too.
  // The old filter (platformDeployed || checkoutOrderId) hid deployments that are
  // still building or failed before an order was created.
  return store.deployments || [];
}

function safeJson(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

export async function getOverview() {
  const [userRows, orders, receiptsPending, cleanupJobs, deployments, promo] = await Promise.all([
    prisma.user.findMany({ select: { accountStatus: true, promoEligible: true, promoClaimedAt: true } }),
    prisma.checkoutOrder.findMany({ where: { type: 'deployment' }, select: { status: true, totalAmountCents: true, currency: true, metadata: true } }),
    prisma.paymentReceipt.count({ where: { status: 'pending' } }),
    prisma.deploymentCleanupJob.count(),
    loadDeployments(),
    getPromoUsage(),
  ]);

  // User breakdown
  const users = userRows.length;
  const activeUsers     = userRows.filter((u) => (u.accountStatus || 'active') === 'active').length;
  const suspendedUsers  = userRows.filter((u) => u.accountStatus === 'suspended').length;
  const disabledUsers   = userRows.filter((u) => u.accountStatus === 'disabled').length;
  const deletedUsers    = userRows.filter((u) => u.accountStatus === 'deleted').length;
  const promoUsers      = userRows.filter((u) => u.promoClaimedAt).length;

  const ordersByStatus = { paid: 0, pending: 0, payment_uploaded: 0, expired: 0 };
  let paidCents = 0;
  let paidCurrency = 'PGK';
  // Internal provider-cost estimate accrues per PAID order (Render is Glondia's
  // own cost, never billed to the customer).
  let estimatedProviderCostCents = 0;
  let providerCostCurrency = 'USD';
  for (const o of orders) {
    ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
    if (o.status === 'paid') {
      paidCents += o.totalAmountCents || 0;
      paidCurrency = o.currency || paidCurrency;
      const meta = safeJson(o.metadata);
      estimatedProviderCostCents += Number(meta.estimatedProviderCostCents || 0);
      if (meta.estimatedProviderCostCurrency) providerCostCurrency = meta.estimatedProviderCostCurrency;
    }
  }

  // Deployment breakdowns
  const deploymentsByPayment = {};
  let activeHosting = 0, pendingHosting = 0, failedHosting = 0, suspendedHosting = 0;
  let freeHosting = 0, paidHosting = 0, promoHosting = 0;
  for (const d of deployments) {
    const k = d.paymentStatus || 'none';
    deploymentsByPayment[k] = (deploymentsByPayment[k] || 0) + 1;
    const s = (d.status || '').toLowerCase();
    if (s === 'live' || s === 'deployed') activeHosting++;
    else if (s === 'building' || s === 'queued') pendingHosting++;
    else if (s === 'failed' || s === 'error') failedHosting++;
    else if (s === 'suspended' || s === 'account_suspended') suspendedHosting++;
    if (d.paymentStatus === 'paid') paidHosting++;
    else freeHosting++;
    if (d.billingTierId === 'promo_50') promoHosting++;
  }

  return {
    users,
    userBreakdown: { active: activeUsers, suspended: suspendedUsers, disabled: disabledUsers, deleted: deletedUsers, promo: promoUsers },
    deployments: {
      total: deployments.length,
      active: activeHosting,
      pending: pendingHosting,
      failed: failedHosting,
      suspended: suspendedHosting,
      free: freeHosting,
      paid: paidHosting,
      promo: promoHosting,
      byPaymentStatus: deploymentsByPayment,
    },
    orders: {
      total: orders.length,
      byStatus: ordersByStatus,
      paid: ordersByStatus.paid,
      pending: ordersByStatus.pending,
      payment_uploaded: ordersByStatus.payment_uploaded,
      expired: ordersByStatus.expired,
    },
    receipts: { pending: receiptsPending },
    cleanupJobs,
    promo: {
      limit: promo.limit,
      used: promo.used,
      remaining: promo.remaining,
      paidPromo: promo.paidPromo,
      paidStandard: promo.paidStandard,
    },
    revenue: { paidCents, currency: paidCurrency, paidDisplay: `${paidCurrency} ${(paidCents / 100).toFixed(2)}` },
    // Internal only: provider cost + platform margin. Currencies differ (customer
    // pays PGK, Render cost tracked in its own currency) so they are NOT mixed.
    providerCost: {
      estimatedCents: estimatedProviderCostCents,
      currency: providerCostCurrency,
      display: `${providerCostCurrency} ${(estimatedProviderCostCents / 100).toFixed(2)}`,
    },
    platformMargin: {
      revenueCents: paidCents,
      revenueCurrency: paidCurrency,
      estimatedProviderCostCents,
      providerCostCurrency,
      note: 'Customer revenue (PGK) and provider cost are tracked in separate currencies and not netted.',
    },
  };
}

export async function listUsers() {
  // Full rows mapped through userView, which whitelists safe fields (no
  // passwordHash, no raw avatar/ID-photo paths) and derives hasAvatar/avatarUrl.
  const rows = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(userView);
}

export async function listDeployments(ownerUserId = null) {
  const [deployments, orders] = await Promise.all([
    loadDeployments(),
    prisma.checkoutOrder.findMany({ where: { type: 'deployment' } }),
  ]);
  const byId = {};
  for (const o of orders) {
    byId[o.id] = o;
    if (o.deploymentId) byId[`dep:${o.deploymentId}`] = o;
  }
  return deployments
    .filter((d) => !ownerUserId || d.userId === ownerUserId)
    .filter((d) => d.status !== 'deleted' && d.recordStatus !== 'deleted')
    .map((d) => deploymentView(d, byId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function listOrders() {
  return prisma.checkoutOrder.findMany({
    where: { type: 'deployment' },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}

export async function listReceipts() {
  const rows = await prisma.paymentReceipt.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { checkoutOrder: { select: { id: true, status: true, deploymentId: true, userId: true, totalAmountCents: true, currency: true } } },
  });
  // Never leak the raw SSD filePath in list responses.
  return rows.map(receiptListView);
}

export async function approveReceipt(receiptId, adminUserId) {
  const receipt = await prisma.paymentReceipt.findUnique({ where: { id: receiptId }, include: { checkoutOrder: true } });
  if (!receipt) throw Object.assign(new Error('Receipt not found.'), { status: 404, expose: true });

  await prisma.paymentReceipt.update({
    where: { id: receipt.id },
    data: { status: 'approved', reviewedByUserId: adminUserId, reviewedAt: new Date() },
  });

  const order = receipt.checkoutOrder;
  let paidResult = null;
  if (order?.deploymentId) {
    paidResult = await markDeploymentPaid({ deploymentId: order.deploymentId, checkoutOrderId: order.id, actorUserId: adminUserId, via: 'manual_admin_approval' });
    await syncServiceAccessOnPayment({ userId: receipt.userId || order?.userId, deploymentId: order.deploymentId, orderId: order.id, via: 'manual_admin_approval' });
  } else if (order) {
    await prisma.checkoutOrder.update({ where: { id: order.id }, data: { status: 'paid', paidAt: new Date() } });
  }

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.receipt.approved',
    entityType: 'payment_receipt',
    entityId: receipt.id,
    result: { checkoutOrderId: order?.id || null, deploymentId: order?.deploymentId || null },
  });

  await createUserNotification(receipt.userId || order?.userId, {
    type: 'success',
    title: 'Receipt approved',
    message: 'Your bank receipt was approved. Hosting is now active.',
    actionUrl: '/dashboard/billing',
    entityType: 'receipt',
    entityId: receipt.id,
  });

  return { receiptId: receipt.id, status: 'approved', payment: paidResult };
}

export async function rejectReceipt(receiptId, adminUserId, note = null) {
  const receipt = await prisma.paymentReceipt.findUnique({ where: { id: receiptId }, include: { checkoutOrder: true } });
  if (!receipt) throw Object.assign(new Error('Receipt not found.'), { status: 404, expose: true });

  await prisma.paymentReceipt.update({
    where: { id: receipt.id },
    data: { status: 'rejected', reviewedByUserId: adminUserId, reviewedAt: new Date(), reviewNote: note ? String(note).slice(0, 1000) : null },
  });

  // Return the order to pending so the user can retry payment within the window.
  const order = receipt.checkoutOrder;
  if (order && order.status !== 'paid') {
    await prisma.checkoutOrder.update({ where: { id: order.id }, data: { status: 'pending' } });
    if (order.deploymentId) {
      const deployment = await findDeploymentRecord(order.deploymentId);
      if (deployment && deployment.paymentStatus !== 'paid') {
        await updateDeploymentRecord(order.deploymentId, { paymentStatus: 'pending' });
      }
    }
  }

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.receipt.rejected',
    entityType: 'payment_receipt',
    entityId: receipt.id,
    result: { checkoutOrderId: order?.id || null, note: note || null },
  });

  await createUserNotification(receipt.userId || order?.userId, {
    type: 'warning',
    title: 'Receipt rejected',
    message: 'Your bank receipt was rejected. Please upload a valid receipt or contact support.',
    actionUrl: '/dashboard/billing',
    entityType: 'receipt',
    entityId: receipt.id,
  });

  return { receiptId: receipt.id, status: 'rejected' };
}

export async function adminMarkDeploymentPaid(deploymentId, adminUserId) {
  const deployment = await findDeploymentRecord(deploymentId);
  if (!deployment) throw Object.assign(new Error('Deployment not found.'), { status: 404, expose: true });
  return markDeploymentPaid({ deploymentId, actorUserId: adminUserId, via: 'admin_mark_paid' });
}

export async function adminRenewDeploymentManually(deploymentId, adminUserId) {
  const deployment = await findDeploymentRecord(deploymentId);
  if (!deployment) throw Object.assign(new Error('Deployment not found.'), { status: 404, expose: true });
  const renewal = await createDeploymentRenewalOrder({
    deploymentId,
    user: { id: deployment.userId || adminUserId, role: 'admin' },
  });
  const result = await markDeploymentPaid({
    deploymentId,
    checkoutOrderId: renewal.checkoutOrderId,
    actorUserId: adminUserId,
    via: 'admin_manual_renewal',
  });
  return { deploymentId, renewalOrderId: renewal.checkoutOrderId, ...result };
}

export async function adminDeleteDeployment(deploymentId, adminUserId) {
  const deployment = await findDeploymentRecord(deploymentId);
  if (!deployment) throw Object.assign(new Error('Deployment not found.'), { status: 404, expose: true });
  const order = await getOrderForDeployment(deploymentId);
  return expireDeployment({ deployment, order, action: 'delete', reason: 'admin_deleted', actorUserId: adminUserId });
}

// ─── User detail + account lifecycle ──────────────────────────────────────────

/** Full admin view of a single user: profile + their deployments, orders, receipts. */
export async function getUserDetail(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw httpError('User not found.', 404);

  const [orders, receiptRows, store] = await Promise.all([
    prisma.checkoutOrder.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.paymentReceipt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 500 }),
    readHostingStore(),
  ]);

  const deployments = (store.deployments || [])
    .filter((d) => d.userId === userId)
    .map((d) => deploymentView(d))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  // Totals derived from order status (payment_uploaded → "uploaded").
  const totals = { paid: 0, pending: 0, uploaded: 0, expired: 0 };
  for (const o of orders) {
    if (o.status === 'paid') totals.paid += 1;
    else if (o.status === 'pending') totals.pending += 1;
    else if (o.status === 'payment_uploaded') totals.uploaded += 1;
    else if (o.status === 'expired') totals.expired += 1;
  }

  return {
    user: userView(user),
    deployments,
    orders,
    receipts: receiptRows.map(receiptListView),
    totals,
  };
}

/** Update a limited, validated set of profile/account fields. */
export async function updateUser(userId, patch = {}, adminUserId = null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw httpError('User not found.', 404);

  const data = {};
  if (patch.name !== undefined) data.name = patch.name ? String(patch.name).slice(0, 200) : null;
  if (patch.phone !== undefined) data.phone = patch.phone ? String(patch.phone).slice(0, 50) : null;
  if (patch.profileDetails !== undefined) {
    const details = typeof patch.profileDetails === 'string' ? safeJson(patch.profileDetails) : patch.profileDetails;
    data.profileDetails = JSON.stringify(details || {});
  }
  if (patch.role !== undefined) {
    if (!VALID_ROLES.has(String(patch.role))) throw httpError('Invalid role.', 400);
    data.role = String(patch.role);
  }
  if (patch.accountStatus !== undefined) {
    if (!VALID_ACCOUNT_STATUS.has(String(patch.accountStatus))) throw httpError('Invalid account status.', 400);
    data.accountStatus = String(patch.accountStatus);
  }

  const updated = await prisma.user.update({ where: { id: userId }, data });

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.user.updated',
    entityType: 'user',
    entityId: userId,
    result: { fields: Object.keys(data) },
  });

  return userView(updated);
}

/** All deployment records owned by a user (from the JSON hosting store). */
async function userDeployments(userId) {
  const store = await readHostingStore();
  return (store.deployments || []).filter((d) => d.userId === userId);
}

/**
 * Suspend every active site a user owns (account-level suspend). Render services
 * are suspended (reversible); records are marked suspended with the account
 * reason. Best-effort — individual failures are recorded, never thrown.
 */
async function cascadeSuspendUserDeployments(userId, reason) {
  const deployments = await userDeployments(userId);
  const results = [];
  for (const d of deployments) {
    if (d.status === 'deleted' || d.recordStatus === 'deleted') continue;
    let render = 'skipped';
    if (d.renderServiceId && renderApiService.configured()) {
      try { await renderApiService.suspendService(d.renderServiceId); render = 'suspended'; }
      catch (err) { render = `error: ${err.message}`; }
    }
    let githubArchive = null;
    const targetRoot = d.generatedSite?.githubTargetRoot || d.environmentConfiguration?.rootDirectory;
    if (isGeneratedTemplateRoot(targetRoot)) {
      try {
        githubArchive = await archiveGeneratedSiteFolder({
          repoUrl: d.repoUrl || d.githubRepo || d.environmentConfiguration?.sourceRepository,
          branch: d.githubBranch || d.environmentConfiguration?.branch || 'main',
          targetRoot,
          reason: reason || 'account_deleted',
        });
      } catch (err) {
        githubArchive = { attempted: true, error: err.message };
      }
    }
    await updateDeploymentRecord(d.deploymentId, {
      status: 'suspended',
      currentStep: 'Suspended (account suspended)',
      accountSuspendedAt: nowIso(),
      suspensionReason: reason || 'account_suspended',
    });
    results.push({ deploymentId: d.deploymentId, render });
  }
  return results;
}

/**
 * Bring down every site a user owns (account closure). Prefer deleting the
 * Render service; if delete fails, suspend it and flag cleanup. Records are
 * marked account_deleted but kept for audit/history.
 */
async function cascadeBringDownUserDeployments(userId, reason) {
  const deployments = await userDeployments(userId);
  const results = [];
  for (const d of deployments) {
    if (d.status === 'deleted' || d.recordStatus === 'deleted') continue;
    let render = 'skipped';
    let cleanupNeeded = false;
    if (d.renderServiceId && renderApiService.configured()) {
      try {
        await renderApiService.deleteService(d.renderServiceId);
        render = 'deleted';
      } catch (err) {
        try { await renderApiService.suspendService(d.renderServiceId); render = `suspended_delete_failed: ${err.message}`; }
        catch (err2) { render = `error: ${err2.message}`; }
        cleanupNeeded = true;
      }
    }
    await updateDeploymentRecord(d.deploymentId, {
      status: 'account_deleted',
      currentStep: 'Account closed — site brought down',
      deletedReason: reason || 'account_deleted',
      deletedAt: nowIso(),
      ...(githubArchive ? { githubArchive } : {}),
      ...(cleanupNeeded ? { cleanupNeeded: true } : {}),
    });
    results.push({ deploymentId: d.deploymentId, render, githubArchive, cleanupNeeded });
  }
  return results;
}

/**
 * Suspend an account (temporary). Distinct from delete: records survive and an
 * admin can reactivate. Cascades a suspend to all of the user's sites.
 */
export async function suspendUser(userId, reason = null, adminUserId = null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw httpError('User not found.', 404);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      accountStatus: 'suspended',
      disabledAt: new Date(),
      disabledReason: reason ? String(reason).slice(0, 1000) : 'admin_suspended',
    },
  });
  await revokeUserRefreshTokens(userId);
  const deployments = await cascadeSuspendUserDeployments(userId, reason || 'account_suspended');

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.user.suspended',
    entityType: 'user',
    entityId: userId,
    result: { reason: reason || 'admin_suspended', deployments: deployments.length },
  });

  return { ...userView(updated), deployments };
}

export async function disableUser(userId, reason = null, adminUserId = null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw httpError('User not found.', 404);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      accountStatus: 'disabled',
      disabledAt: new Date(),
      disabledReason: reason ? String(reason).slice(0, 1000) : 'admin_disabled',
    },
  });
  await revokeUserRefreshTokens(userId);

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.user.disabled',
    entityType: 'user',
    entityId: userId,
    result: { reason: reason || 'admin_disabled' },
  });

  return userView(updated);
}

export async function reactivateUser(userId, adminUserId = null, { resumeDeployments = false } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw httpError('User not found.', 404);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      accountStatus: 'active',
      reactivatedAt: new Date(),
      disabledReason: null,
      disabledAt: null,
      deletedAt: null,
    },
  });

  // Optionally resume the user's suspended sites (only those suspended at the
  // account level — never auto-revive account_deleted sites).
  let resumed = [];
  if (resumeDeployments) {
    const deployments = await userDeployments(userId);
    for (const d of deployments) {
      if (d.status !== 'suspended') continue;
      let render = 'skipped';
      if (d.renderServiceId && renderApiService.configured()) {
        try { await renderApiService.resumeService(d.renderServiceId); render = 'resumed'; }
        catch (err) { render = `error: ${err.message}`; }
      }
      await updateDeploymentRecord(d.deploymentId, {
        status: d.urlReachable ? 'live' : 'deployed',
        currentStep: 'Live',
        accountSuspendedAt: null,
        suspensionReason: null,
      });
      resumed.push({ deploymentId: d.deploymentId, render });
    }
  }

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.user.reactivated',
    entityType: 'user',
    entityId: userId,
    result: { resumeDeployments, resumed: resumed.length },
  });

  return { ...userView(updated), resumed };
}

/**
 * Best-effort delete of user-owned rows across Prisma models that store userId
 * as a plain string (no FK cascade). Missing tables are ignored so older DBs
 * do not break hard-delete.
 */
async function purgeUserOwnedPrismaRows(userId) {
  const cleaned = {};
  async function tryDelete(label, fn) {
    try {
      const result = await fn();
      cleaned[label] = result?.count ?? result ?? true;
    } catch (err) {
      cleaned[label] = `skip: ${err.message}`;
    }
  }

  // Ownership / auth / messaging
  await tryDelete('refreshToken', () => prisma.refreshToken.deleteMany({ where: { userId } }));
  await tryDelete('notification', () => prisma.notification.deleteMany({ where: { userId } }));
  await tryDelete('notificationPreference', () => prisma.notificationPreference.deleteMany({ where: { userId } }));
  await tryDelete('adminMfaMethod', () => prisma.adminMfaMethod.deleteMany({ where: { userId } }));
  await tryDelete('ticket', () => prisma.ticket.deleteMany({ where: { userId } })); // messages cascade
  await tryDelete('serviceRequest', () => prisma.serviceRequest.deleteMany({ where: { userId } }));
  await tryDelete('serviceAccess', () => prisma.serviceAccess.deleteMany({ where: { userId } }));
  await tryDelete('watchdogEvent', () => prisma.watchdogEvent.deleteMany({ where: { userId } }));
  await tryDelete('analyticsEvent', () => prisma.analyticsEvent.deleteMany({ where: { userId } }));
  await tryDelete('chatbotInteraction', () => prisma.chatbotInteraction.deleteMany({ where: { userId } }));
  await tryDelete('crmAiSession', () => prisma.crmAiSession.deleteMany({ where: { userId } }));
  await tryDelete('crmEmailListMember', () => prisma.crmEmailListMember.deleteMany({ where: { userId } }));
  await tryDelete('customerLifecycle', () => prisma.customerLifecycle.deleteMany({ where: { userId } }));

  // Billing / commerce owned by the customer
  await tryDelete('paymentMethod', () => prisma.paymentMethod.deleteMany({ where: { userId } }));
  await tryDelete('discountRedemption', () => prisma.discountRedemption.deleteMany({ where: { userId } }));
  await tryDelete('invoice', () => prisma.invoice.deleteMany({ where: { userId } }));
  await tryDelete('creditNote', () => prisma.creditNote.deleteMany({ where: { userId } }));
  await tryDelete('paymentReceipt', () => prisma.paymentReceipt.deleteMany({ where: { userId } }));
  await tryDelete('deploymentSubscription', () => prisma.deploymentSubscription.deleteMany({ where: { userId } }));
  await tryDelete('deploymentCleanupJob', () => prisma.deploymentCleanupJob.deleteMany({ where: { userId } }));
  await tryDelete('checkoutOrder', () => prisma.checkoutOrder.deleteMany({ where: { userId } }));

  // Infrastructure services created by the customer
  await tryDelete('vpsService', () => prisma.vpsService.deleteMany({ where: { createdByUserId: userId } }));
  await tryDelete('webHostingService', () => prisma.webHostingService.deleteMany({ where: { createdByUserId: userId } }));
  await tryDelete('businessService', () => prisma.businessService.deleteMany({ where: { createdByUserId: userId } }));

  // Notes / commands targeting this customer (keep admin-authored history only when not target)
  await tryDelete('adminNote', () => prisma.adminNote.deleteMany({ where: { targetUserId: userId } }));
  await tryDelete('adminCommand', () => prisma.adminCommand.deleteMany({ where: { targetUserId: userId } }));

  return cleaned;
}

/**
 * Remove hosting-store deployments owned by this user after bring-down.
 * Keeps the JSON store consistent with a hard-deleted account.
 */
async function purgeUserHostingDeployments(userId) {
  let removed = 0;
  try {
    await mutateHostingStore((store) => {
      const before = Array.isArray(store.deployments) ? store.deployments.length : 0;
      store.deployments = (store.deployments || []).filter((d) => d.userId !== userId);
      removed = before - store.deployments.length;
      return store;
    });
  } catch (err) {
    return { removed: 0, error: err.message };
  }
  return { removed };
}

/**
 * Hard-delete a client account from the main database.
 *
 * Admin delete in the dashboard is permanent for customer (non-admin) accounts:
 *  1) bring down Render/hosting for their sites
 *  2) purge user-owned Prisma rows
 *  3) delete the User row itself
 *
 * Soft-delete is intentionally not used for admin "Delete" — soft-deleted users
 * still blocked login and cluttered the DB (see Local Admin recovery incident).
 * Admin accounts cannot be deleted here (protect operator access).
 */
export async function deleteUser(userId, reason = null, adminUserId = null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw httpError('User not found.', 404);

  if (adminUserId && userId === adminUserId) {
    throw httpError('You cannot delete your own admin account.', 400);
  }
  if (String(user.role || '').toLowerCase() === 'admin') {
    throw httpError('Admin accounts cannot be deleted from the customer panel. Use a dedicated operator process.', 403);
  }

  const why = reason ? String(reason).slice(0, 1000) : 'account_deleted';
  const snapshot = userView(user);

  // 1) Force logout + take sites offline (provider best-effort).
  await revokeUserRefreshTokens(userId);
  const deployments = await cascadeBringDownUserDeployments(userId, why);

  // 2) Purge related main-DB rows, then the user row itself.
  const cleaned = await purgeUserOwnedPrismaRows(userId);
  await prisma.user.delete({ where: { id: userId } });

  // 3) Drop hosting-store ownership for this user.
  const hosting = await purgeUserHostingDeployments(userId);

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.user.hard_deleted',
    entityType: 'user',
    entityId: userId,
    result: {
      reason: why,
      hardDelete: true,
      email: snapshot.email,
      name: snapshot.name,
      deployments: deployments.length,
      hostingRemoved: hosting.removed,
      cleaned,
    },
  });

  return {
    deleted: true,
    hardDelete: true,
    id: userId,
    email: snapshot.email,
    name: snapshot.name,
    deployments,
    hosting,
    cleaned,
  };
}

export async function setUserIdPhotoPath(userId, filePath, adminUserId = null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw httpError('User not found.', 404);

  const updated = await prisma.user.update({ where: { id: userId }, data: { idPhotoPath: filePath } });

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.user.id_photo_uploaded',
    entityType: 'user',
    entityId: userId,
    result: {},
  });

  return userView(updated);
}

// ─── Deployment lifecycle (suspend / reactivate / approve billing) ────────────

export async function suspendDeployment(deploymentId, adminUserId = null, reason = null) {
  const deployment = await findDeploymentRecord(deploymentId);
  if (!deployment) throw httpError('Deployment not found.', 404);

  let renderResult = 'skipped';
  if (deployment.renderServiceId && renderApiService.configured()) {
    try {
      await renderApiService.suspendService(deployment.renderServiceId);
      renderResult = 'suspended';
    } catch (err) {
      renderResult = `error: ${err.message}`;
      console.error(`[admin] Render suspend failed for ${deploymentId}:`, err.message);
    }
  }

  await updateDeploymentRecord(deploymentId, {
    status: 'suspended',
    currentStep: 'Suspended (admin)',
    suspendedAt: nowIso(),
    suspendedReason: reason ? String(reason).slice(0, 1000) : 'admin_suspended',
  });

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.deployment.suspended',
    entityType: 'deployment',
    entityId: deploymentId,
    result: { renderResult, reason: reason || 'admin_suspended' },
  });

  return { deploymentId, status: 'suspended', render: renderResult };
}

export async function reactivateDeployment(deploymentId, adminUserId = null) {
  const deployment = await findDeploymentRecord(deploymentId);
  if (!deployment) throw httpError('Deployment not found.', 404);

  let renderResult = 'skipped';
  if (deployment.renderServiceId && renderApiService.configured()) {
    try {
      await renderApiService.resumeService(deployment.renderServiceId);
      renderResult = 'resumed';
    } catch (err) {
      renderResult = `error: ${err.message}`;
      console.error(`[admin] Render resume failed for ${deploymentId}:`, err.message);
    }
  }

  const newStatus = deployment.urlReachable ? 'live' : 'deployed';
  await updateDeploymentRecord(deploymentId, {
    status: newStatus,
    currentStep: 'Live',
    suspendedAt: null,
    suspendedReason: null,
  });

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.deployment.reactivated',
    entityType: 'deployment',
    entityId: deploymentId,
    result: { renderResult, status: newStatus },
  });

  return { deploymentId, status: newStatus, render: renderResult };
}

/** Approve billing/hosting: mark the deployment + its order paid via admin approval. */
export async function approveDeploymentBilling(deploymentId, adminUserId = null) {
  const deployment = await findDeploymentRecord(deploymentId);
  if (!deployment) throw httpError('Deployment not found.', 404);

  const result = await markDeploymentPaid({ deploymentId, actorUserId: adminUserId, via: 'admin_billing_approval' });

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.deployment.billing_approved',
    entityType: 'deployment',
    entityId: deploymentId,
    result: { orderId: result?.orderId || null },
  });

  return { deploymentId, paymentStatus: 'paid', ...result };
}

/**
 * Admin manual Render plan override (free | starter | standard), optionally
 * redeploying. Web services apply the plan on Render; static sites have no paid
 * plan, so we only record the change locally.
 */
export async function setDeploymentRenderPlan(deploymentId, plan, { redeploy = false, adminUserId = null } = {}) {
  const normalizedPlan = String(plan || '').toLowerCase();
  if (!VALID_RENDER_PLANS.has(normalizedPlan)) {
    throw httpError('Plan must be one of: free, starter, standard.', 400);
  }
  const deployment = await findDeploymentRecord(deploymentId);
  if (!deployment) throw httpError('Deployment not found.', 404);
  if (!deployment.renderServiceId) throw httpError('Deployment has no hosting service to update.', 400);

  const isStatic = deployment.serviceType === 'static_site';
  let renderResult = 'skipped';
  let redeployed = false;

  if (renderApiService.configured()) {
    if (isStatic) {
      renderResult = 'skipped_static'; // static sites have no paid plan
    } else {
      try {
        await renderApiService.updateWebServiceSettings(deployment.renderServiceId, { plan: normalizedPlan });
        renderResult = 'updated';
      } catch (err) {
        console.error(`[admin] Render plan change failed for ${deploymentId}:`, err.message);
        throw httpError(`Render plan update failed: ${err.message}`, 502);
      }
    }
    if (redeploy && !isStatic) {
      try {
        await renderApiService.triggerDeploy(deployment.renderServiceId, {});
        redeployed = true;
      } catch (err) {
        console.error(`[admin] Redeploy after plan change failed for ${deploymentId}:`, err.message);
      }
    }
  } else {
    renderResult = 'render_not_configured';
  }

  await updateDeploymentRecord(deploymentId, {
    renderPlan: normalizedPlan,
    renderPlanChangedAt: nowIso(),
    renderPlanChangedBy: adminUserId || 'admin',
  });

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.deployment.render_plan_changed',
    entityType: 'deployment',
    entityId: deploymentId,
    result: { plan: normalizedPlan, render: renderResult, redeployed },
  });

  return { deploymentId, renderPlan: normalizedPlan, render: renderResult, redeployed };
}

/**
 * Activity log — returns the most recent audit log entries for the admin
 * activity timeline. Falls back to an empty array when audit_logs table
 * does not yet exist (migrations pending).
 */
export async function getActivity({ limit = 100, offset = 0, action = null, userId = null } = {}) {
  try {
    const where = {};
    if (action) where.action = { contains: action };
    if (userId) where.actorUserId = userId;
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit) || 100,
      skip: Number(offset) || 0,
      select: {
        id: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        status: true,
        createdAt: true,
      },
    });
    return rows;
  } catch (err) {
    // Table may not exist yet — return empty rather than crashing
    if (err?.code === 'P2021') return [];
    throw err;
  }
}

/**
 * Config status — tells the frontend which integrations are configured
 * without exposing the actual secret values.
 */
export function getConfigStatus() {
  const bool = (v) => Boolean(v && String(v).trim().length > 0);
  return {
    render: {
      configured: bool(process.env.RENDER_API_KEY) && bool(process.env.RENDER_SERVICE_ID),
      serviceId: process.env.RENDER_SERVICE_ID ? `…${String(process.env.RENDER_SERVICE_ID).slice(-6)}` : null,
    },
    paypal: {
      configured: bool(process.env.PAYPAL_CLIENT_ID) && bool(process.env.PAYPAL_SECRET),
    },
    github: {
      configured: bool(process.env.GITHUB_GENERATED_SITES_TOKEN),
      repoUrl: process.env.RENDER_GENERATED_SITES_REPO_URL || null,
    },
    spaceship: {
      configured: bool(process.env.SPACESHIP_API_KEY) && bool(process.env.SPACESHIP_SECRET),
    },
    database: {
      url: process.env.DATABASE_URL ? `…configured` : 'NOT SET',
    },
    billing: {
      currency: process.env.BILLING_CURRENCY || 'PGK',
      markupPercent: Number(process.env.PLATFORM_MARKUP_PERCENT || 30),
      promoLimit: Number(process.env.DEPLOYMENT_PROMO_SIGNUP_LIMIT || 20),
      manualBankEnabled: bool(process.env.MANUAL_BANK_ACCOUNT_NAME) || bool(process.env.MANUAL_BANK_DETAILS),
      bankDetails: process.env.MANUAL_BANK_ACCOUNT_NAME || null,
    },
  };
}

export async function deleteOrder(orderId, adminUserId) {
  const order = await prisma.checkoutOrder.findUnique({ where: { id: orderId } });
  if (!order) throw httpError('Order not found.', 404);

  // Hard-delete — cascades to linked PaymentReceipt rows (onDelete: Cascade).
  await prisma.checkoutOrder.delete({ where: { id: orderId } });

  await writeAuditLog({
    actorUserId: adminUserId,
    action: 'admin.order.deleted',
    entityType: 'checkout_order',
    entityId: orderId,
    result: { status: order.status, deploymentId: order.deploymentId || null },
  });

  return { orderId, deleted: true };
}

function isGeneratedTemplateRoot(value = '') {
  const root = String(process.env.RENDER_GENERATED_TEMPLATE_SITES_ROOT_DIR || process.env.GENERATED_TEMPLATE_SITES_ROOT_DIR || 'generated-template-sites').replace(/^\/+|\/+$/g, '');
  return String(value || '').replace(/\\/g, '/').startsWith(`${root}/`);
}

export default {
  getOverview,
  listUsers,
  listDeployments,
  listOrders,
  listReceipts,
  approveReceipt,
  rejectReceipt,
  adminMarkDeploymentPaid,
  adminRenewDeploymentManually,
  adminDeleteDeployment,
  getUserDetail,
  updateUser,
  suspendUser,
  disableUser,
  reactivateUser,
  deleteUser,
  setUserIdPhotoPath,
  suspendDeployment,
  reactivateDeployment,
  approveDeploymentBilling,
  setDeploymentRenderPlan,
  deleteOrder,
  getActivity,
  getConfigStatus,
};
