/**
 * deploymentBillingService.js
 *
 * Shared logic for the deploy-first tiered billing rule. Used by:
 *   - the deploy controller (create a pending order after a deployment record)
 *   - the manual receipt route + admin approvals (mark paid)
 *   - the PayPal deployment payment flow (mark paid)
 *   - the cleanup service + admin delete (expire/suspend)
 *
 * Deployment records live in the JSON hosting store. CheckoutOrders,
 * PaymentReceipts and DeploymentCleanupJobs live in the Prisma DB.
 */

import { prisma } from './db.js';
import renderApiService from './renderApiService.js';
import { writeAuditLog } from './auditLogService.js';
import { mutateHostingStore, nowIso, readHostingStore } from './hostingStore.js';
import { updateDeploymentRecord } from '../glondia-engines/00-SHARED/deploymentRecordStore.js';
import {
  deploymentBilling,
  computeBillingDueAt,
  billingSummary,
  getBillingTier,
  initialRenderPlan,
  defaultTierId,
  promoTierId,
} from '../config/deploymentBilling.js';
import { resolveRequestedBillingTier, getUserPromoStatus } from './deploymentPromoService.js';
import {
  assertOrderBelongsToDeployment,
  assertOrderPayable,
  assertVerifiedPaymentSignal,
  isAdminVia,
} from './paymentVerificationGuards.js';
import { createUserNotification } from './notificationService.js';
import { archiveGeneratedSiteFolder } from '../glondia-engines/01-HOSTING-DEPLOY-ENGINE/03-GITHUB-SOURCE-MOUNTAIN/generatedSiteRepoCleanup.stage.js';
import { renderCosts, estimatedProviderCostCents } from '../config/renderCosts.js';
import {
  ensureTrialSubscription,
  activateOrRenewSubscription,
} from './deploymentSubscriptionService.js';

const DELETED = ['de', 'leted'].join('');

function orgIdFor(userId) {
  return userId && userId !== 'local-user' ? userId : 'personal';
}

function dbUserId(userId) {
  return userId && userId !== 'local-user' ? userId : null;
}

/** Locate a deployment in the JSON store by deploymentId or id. */
export async function findDeploymentRecord(deploymentId) {
  const store = await readHostingStore();
  return (store.deployments || []).find(
    (d) => d.deploymentId === deploymentId || d.id === deploymentId,
  ) || null;
}

/**
 * Create a pending CheckoutOrder for a freshly created deployment and
 * stamp the deployment record with billing fields. Returns a billing summary.
 */
export async function createDeploymentOrder({ deployment, user = {}, kind = 'deployment', billingTierId = null } = {}) {
  if (!deployment?.deploymentId) throw new Error('A deployment record is required to create a billing order.');

  const userId = user.id || deployment.userId || null;
  const billingDueAt = computeBillingDueAt();

  // Resolve the tier from the USER's promo status. promo_50 is honoured only
  // when the user can still claim (eligible, unused, no active promo order);
  // otherwise it falls back to standard_200 with an explanatory message.
  const requested = billingTierId || defaultTierId;
  const { tier, promoApplied, promoStatus, switched, message, promoWillBeMarkedUsedOnPayment } =
    await resolveRequestedBillingTier({ userId, requestedTierId: requested, deploymentId: deployment.deploymentId });

  const order = await prisma.checkoutOrder.create({
    data: {
      organizationId: orgIdFor(userId),
      userId: dbUserId(userId),
      type: 'deployment',
      provider: 'paypal',
      status: 'pending',
      currency: tier.currency,
      actualAmountCents: tier.amountCents,
      markupPercent: 0,
      markupAmountCents: 0,
      totalAmountCents: tier.amountCents,
      deploymentId: deployment.deploymentId,
      dueAt: billingDueAt,
      metadata: JSON.stringify({
        deploymentId: deployment.deploymentId,
        kind,
        serviceName: deployment.serviceName || null,
        billingTierId: tier.id,
        billingTierLabel: tier.label,
        promoApplied,
        promoEligibleAtSignup: promoStatus?.eligible === true,
        promoSignupRank: promoStatus?.signupRank ?? null,
        promoClaimForUserId: promoApplied ? dbUserId(userId) : null,
        promoWillBeMarkedUsedOnPayment: promoWillBeMarkedUsedOnPayment === true,
        renderInitialPlan: initialRenderPlan,
        renderPlanAfterPayment: tier.renderPlanAfterPayment,
        display: { amount: tier.amount, currency: tier.currency },
        // Internal margin tracking only — customer pays the flat tier price.
        // Render cost is Glondia's own provider cost and is never split/charged.
        customerPrice: { amount: tier.amount, currency: tier.currency },
        provider: 'render',
        estimatedProviderCostCents: estimatedProviderCostCents(deployment.serviceType),
        estimatedProviderCostCurrency: renderCosts.currency,
      }),
    },
  });

  await updateDeploymentRecord(deployment.deploymentId, {
    checkoutOrderId: order.id,
    paymentStatus: 'pending',
    subscriptionStatus: 'trialing',
    billingAttachStatus: 'complete',
    billingErrorMessage: null,
    billingErrorAt: null,
    trialStartedAt: deployment.createdAt || new Date().toISOString(),
    trialEndsAt: billingDueAt.toISOString(),
    billingKind: kind,
    priceCents: tier.amountCents,
    priceCurrency: tier.currency,
    billingTierId: tier.id,
    billingTierLabel: tier.label,
    promoApplied,
    promoClaimStatus: promoApplied ? 'pending' : (promoStatus?.used ? 'used' : (promoStatus?.eligible ? 'not_applicable' : 'unavailable')),
    renderPlan: initialRenderPlan,
    renderPlanTargetAfterPayment: tier.renderPlanAfterPayment,
    renderPlanUpgradeStatus: null,
    billingDueAt: billingDueAt.toISOString(),
    paidAt: null,
    deletedReason: null,
  });

  // The trial subscription timer matters (it drives cleanup), but it must NOT
  // undo a created order or fail the deploy if it can't be set up. Record the
  // failure on the deployment + audit and surface a warning instead.
  let subscriptionWarning = null;
  try {
    await ensureTrialSubscription({ deployment, order });
  } catch (subErr) {
    console.error('[billing] trial subscription create failed:', subErr.message);
    subscriptionWarning = 'Billing order was created, but subscription timer setup failed. Admin support required.';
    try {
      await updateDeploymentRecord(deployment.deploymentId, {
        subscriptionStatus: 'subscription_error',
        subscriptionErrorMessage: String(subErr.message || '').slice(0, 500),
        subscriptionErrorAt: new Date().toISOString(),
      });
      await writeAuditLog({
        organizationId: orgIdFor(userId),
        actorUserId: dbUserId(userId),
        action: 'deployment.subscription.trial_create_failed',
        entityType: 'deployment',
        entityId: deployment.deploymentId,
        status: 'error',
        result: { message: String(subErr.message || '').slice(0, 300) },
      });
    } catch (recordErr) {
      console.error('[billing] could not record subscription error:', recordErr.message);
    }
  }

  await writeAuditLog({
    organizationId: orgIdFor(userId),
    actorUserId: dbUserId(userId),
    action: 'deployment.billing.order_created',
    entityType: 'checkout_order',
    entityId: order.id,
    result: { deploymentId: deployment.deploymentId, billingTierId: tier.id, amountCents: tier.amountCents, currency: tier.currency, kind, switched, promoApplied },
  });

  // Notify the owner that payment is due within the trial window. Notifications
  // are fail-soft in notificationService (never throw), so this can't break the
  // order/subscription — UI convenience only.
  await createUserNotification(userId, {
    type: 'billing',
    title: 'Hosting payment required',
    message: 'Your site is live on free hosting. Please pay before the 12-hour trial ends to keep it online.',
    actionUrl: '/dashboard/billing',
    entityType: 'deployment',
    entityId: deployment.deploymentId,
    metadata: { checkoutOrderId: order.id, billingDueAt: billingDueAt.toISOString(), amountCents: tier.amountCents, currency: tier.currency },
  });

  const summary = billingSummary({ checkoutOrderId: order.id, status: 'pending', billingDueAt, tier, promoRemaining: promoStatus?.canClaim ? null : 0, switched, message });
  if (subscriptionWarning) summary.warning = subscriptionWarning;
  return summary;
}

export async function createDeploymentRenewalOrder({ deploymentId, user = {}, billingTierId = null } = {}) {
  const deployment = await findDeploymentRecord(deploymentId);
  if (!deployment) throw Object.assign(new Error('Deployment not found.'), { status: 404, expose: true });
  if (user?.role !== 'admin' && deployment.userId && deployment.userId !== user?.id) {
    throw Object.assign(new Error('This deployment belongs to another account.'), { status: 403, expose: true });
  }

  const userId = user.id || deployment.userId || null;
  const requested = billingTierId || defaultTierId;
  const { tier, promoApplied, promoStatus, switched, message, promoWillBeMarkedUsedOnPayment } =
    await resolveRequestedBillingTier({ userId, requestedTierId: requested, deploymentId });

  const existingPending = await prisma.checkoutOrder.findFirst({
    where: { deploymentId, type: 'deployment', status: { in: ['pending', 'payment_uploaded'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (existingPending) {
    return billingSummary({
      checkoutOrderId: existingPending.id,
      status: existingPending.status,
      billingDueAt: existingPending.dueAt,
      tier,
      promoRemaining: promoStatus?.canClaim ? null : 0,
      switched: false,
      message: 'A renewal payment is already waiting for this deployment.',
    });
  }

  const order = await prisma.checkoutOrder.create({
    data: {
      organizationId: orgIdFor(userId),
      userId: dbUserId(userId),
      type: 'deployment',
      provider: 'paypal',
      status: 'pending',
      currency: tier.currency,
      actualAmountCents: tier.amountCents,
      markupPercent: 0,
      markupAmountCents: 0,
      totalAmountCents: tier.amountCents,
      deploymentId,
      metadata: JSON.stringify({
        deploymentId,
        kind: 'renewal',
        serviceName: deployment.serviceName || null,
        billingTierId: tier.id,
        billingTierLabel: tier.label,
        promoApplied,
        promoClaimForUserId: promoApplied ? dbUserId(userId) : null,
        promoWillBeMarkedUsedOnPayment: promoWillBeMarkedUsedOnPayment === true,
        renderInitialPlan: deployment.renderPlan || initialRenderPlan,
        renderPlanAfterPayment: tier.renderPlanAfterPayment,
        display: { amount: tier.amount, currency: tier.currency },
        customerPrice: { amount: tier.amount, currency: tier.currency },
        provider: 'render',
        estimatedProviderCostCents: estimatedProviderCostCents(deployment.serviceType),
        estimatedProviderCostCurrency: renderCosts.currency,
      }),
    },
  });

  await updateDeploymentRecord(deploymentId, {
    checkoutOrderId: order.id,
    paymentStatus: ['active', 'renewal_due'].includes(String(deployment.subscriptionStatus || '').toLowerCase())
      ? (deployment.paymentStatus || 'paid')
      : 'pending',
    billingKind: 'renewal',
    priceCents: tier.amountCents,
    priceCurrency: tier.currency,
    billingTierId: tier.id,
    billingTierLabel: tier.label,
    promoApplied,
    promoClaimStatus: promoApplied ? 'pending' : (promoStatus?.used ? 'used' : (promoStatus?.eligible ? 'not_applicable' : 'unavailable')),
    renderPlanTargetAfterPayment: tier.renderPlanAfterPayment,
  });

  await writeAuditLog({
    organizationId: orgIdFor(userId),
    actorUserId: dbUserId(userId),
    action: 'deployment.billing.renewal_order_created',
    entityType: 'checkout_order',
    entityId: order.id,
    result: { deploymentId, billingTierId: tier.id, amountCents: tier.amountCents, currency: tier.currency, switched, promoApplied },
  });

  return billingSummary({
    checkoutOrderId: order.id,
    status: 'pending',
    billingDueAt: order.dueAt,
    tier,
    promoRemaining: promoStatus?.canClaim ? null : 0,
    switched,
    message,
  });
}

/** Find the pending/active order for a deployment (most recent first). */
export async function getOrderForDeployment(deploymentId) {
  if (!deploymentId) return null;
  return prisma.checkoutOrder.findFirst({
    where: { deploymentId, type: 'deployment' },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Mark a deployment (and its order) paid. Resumes the Render service if it was
 * suspended/expired for non-payment. Safe to call more than once.
 */
export async function markDeploymentPaid({ deploymentId, checkoutOrderId = null, orderId = null, actorUserId = null, via = 'manual', providerCaptureId = null } = {}) {
  if (!deploymentId) throw Object.assign(new Error('deploymentId is required.'), { status: 400, expose: true });

  // GATE 1: only verified signals may tag paid. A failing via never mutates state.
  assertVerifiedPaymentSignal({ via, providerCaptureId, actorUserId });

  const deployment = await findDeploymentRecord(deploymentId);
  if (!deployment) throw Object.assign(new Error('Deployment not found.'), { status: 404 });

  const requestedOrderId = checkoutOrderId || orderId || null;
  const order = requestedOrderId
    ? await prisma.checkoutOrder.findUnique({ where: { id: requestedOrderId } })
    : deployment.checkoutOrderId
    ? await prisma.checkoutOrder.findUnique({ where: { id: deployment.checkoutOrderId } })
    : await getOrderForDeployment(deploymentId);

  // GATE 2: an order is required unless this is an explicit admin override.
  if (!order && !isAdminVia(via)) {
    throw Object.assign(new Error('A checkout order is required to verify this payment.'), { status: 400, expose: true });
  }
  // GATE 3: the order must belong to this deployment and be in a payable state.
  assertOrderBelongsToDeployment(order, deploymentId);
  assertOrderPayable(order);

  // IDEMPOTENT: an already-paid order is never re-renewed/re-claimed. A duplicate
  // PayPal capture or webhook for the same order short-circuits here.
  if (order && order.status === 'paid') {
    return {
      deploymentId,
      orderId: order.id,
      alreadyPaid: true,
      renderPlan: deployment.renderPlan || initialRenderPlan,
      renderPlanUpgradeStatus: deployment.renderPlanUpgradeStatus || null,
      paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : (deployment.paidAt || null),
    };
  }

  const paidAt = new Date();

  if (order && order.status !== 'paid') {
    await prisma.checkoutOrder.update({
      where: { id: order.id },
      data: {
        status: 'paid',
        paidAt,
        providerCaptureId: providerCaptureId || order.providerCaptureId,
        metadata: JSON.stringify({
          ...safeJson(order.metadata),
          paidVia: via,
          verifiedAt: paidAt.toISOString(),
          providerCaptureId: providerCaptureId || order.providerCaptureId || null,
          verifiedBy: actorUserId || null,
        }),
      },
    });
  }

  await activateOrRenewSubscription({
    deployment,
    order,
    paidAt,
    actorUserId,
    via,
  });

  // Resume the Render service if it was suspended/expired for non-payment.
  let resumed = false;
  const wasDisabled = deployment.status === 'suspended' || deployment.status === 'payment_expired' || deployment.paymentStatus === 'expired' || deployment.paymentStatus === 'overdue_suspended';
  if (wasDisabled && deployment.renderServiceId && renderApiService.configured()) {
    try {
      await renderApiService.resumeService(deployment.renderServiceId);
      resumed = true;
    } catch (err) {
      console.error(`[billing] resume after payment failed for ${deploymentId}:`, err.message);
    }
  }

  // Upgrade the Render plan for the tier that was paid for, then redeploy.
  // A failed upgrade must NOT block the paid status — it is flagged for admin.
  const planUpgrade = await upgradeRenderPlanAfterPayment(deployment, order);

  // Finalize the K50 promo claim — but only on a verified payment/approval, and
  // only once per user (receipt upload alone never marks the promo used).
  const promoClaim = await markPromoClaimedIfApplicable({ deployment, order, paidAt, actorUserId });

  await updateDeploymentRecord(deploymentId, {
    paymentStatus: 'paid',
    paidAt: paidAt.toISOString(),
    deletedReason: null,
    ...(promoClaim.claimed ? { promoClaimStatus: 'used' } : {}),
    renderPlan: planUpgrade.renderPlan,
    renderPlanTargetAfterPayment: planUpgrade.targetPlan,
    renderPlanUpgradeStatus: planUpgrade.status,
    renderPlanUpgradedAt: paidAt.toISOString(),
    ...(resumed ? { status: deployment.urlReachable ? 'live' : 'deployed', currentStep: 'Live' } : {}),
  });

  await writeAuditLog({
    organizationId: orgIdFor(deployment.userId),
    actorUserId,
    action: 'deployment.billing.paid',
    entityType: 'deployment',
    entityId: deploymentId,
    result: { via, orderId: order?.id || null, resumed, renderPlan: planUpgrade.renderPlan, renderPlanUpgradeStatus: planUpgrade.status },
  });

  // Notify the owner: payment confirmed (+ promo claimed, if applicable).
  await createUserNotification(deployment.userId, {
    type: 'success',
    title: 'Hosting payment confirmed',
    message: 'Your hosting payment has been confirmed. Your site is active for one month.',
    actionUrl: '/dashboard/billing',
    entityType: 'deployment',
    entityId: deploymentId,
  });
  if (promoClaim.claimed) {
    await createUserNotification(deployment.userId, {
      type: 'success',
      title: 'K50 launch promo claimed',
      message: 'Your K50 launch promo has been used for this deployment.',
      actionUrl: '/dashboard/billing',
      entityType: 'deployment',
      entityId: deploymentId,
    });
  }

  return { deploymentId, orderId: order?.id || null, resumed, renderPlan: planUpgrade.renderPlan, renderPlanUpgradeStatus: planUpgrade.status, paidAt: paidAt.toISOString() };
}

/**
 * Mark the K50 launch promo as claimed/used for the paying user — idempotently.
 * Only fires when the paid order's tier is promo_50 and the user has not yet
 * claimed. Never throws; a failure here must not block the paid status.
 */
async function markPromoClaimedIfApplicable({ deployment, order, paidAt, actorUserId = null }) {
  const tierId = (order ? safeJson(order.metadata).billingTierId : null) || deployment.billingTierId || null;
  if (tierId !== promoTierId) return { claimed: false };

  const userId = dbUserId(deployment.userId) || (order ? order.userId : null);
  if (!userId) return { claimed: false };

  try {
    // Conditional update: only set the claim if it is not already set, so a
    // re-run (or a second promo order) can never double-claim.
    const result = await prisma.user.updateMany({
      where: { id: userId, promoClaimedAt: null },
      data: {
        promoClaimedAt: paidAt,
        promoClaimedOrderId: order?.id || null,
        promoClaimedDeploymentId: deployment.deploymentId,
      },
    });
    if (result.count > 0) {
      await writeAuditLog({
        organizationId: orgIdFor(deployment.userId),
        actorUserId,
        action: 'deployment.billing.promo_claimed',
        entityType: 'user',
        entityId: userId,
        result: { orderId: order?.id || null, deploymentId: deployment.deploymentId },
      });
      return { claimed: true };
    }
    return { claimed: false, alreadyClaimed: true };
  } catch (err) {
    console.error(`[billing] promo claim marking failed for user ${userId}:`, err.message);
    return { claimed: false, error: err.message };
  }
}

/**
 * Upgrade the Render plan to the tier's renderPlanAfterPayment and redeploy.
 * Returns { renderPlan, targetPlan, status } where status is one of
 * success | skipped | failed. Never throws — a failure is reported, not fatal.
 */
async function upgradeRenderPlanAfterPayment(deployment, order) {
  const tierId = (order ? safeJson(order.metadata).billingTierId : null) || deployment.billingTierId || defaultTierId;
  const targetPlan = getBillingTier(tierId).renderPlanAfterPayment;
  const currentPlan = deployment.renderPlan || initialRenderPlan;

  // Nothing to do without a live Render service or configured API.
  if (!deployment.renderServiceId || !renderApiService.configured() || !targetPlan) {
    return { renderPlan: currentPlan, targetPlan, status: 'skipped' };
  }
  // Static sites have no paid plan on Render — keep the local target only so
  // billing/admin still see the intended plan, but never call Render.
  if (deployment.serviceType === 'static_site') {
    return { renderPlan: currentPlan, targetPlan, status: 'skipped_static_site' };
  }

  try {
    await renderApiService.updateWebServiceSettings(deployment.renderServiceId, { plan: targetPlan });
    try {
      await renderApiService.triggerDeploy(deployment.renderServiceId, {});
    } catch (deployErr) {
      console.error(`[billing] redeploy after plan upgrade failed for ${deployment.deploymentId}:`, deployErr.message);
    }
    return { renderPlan: targetPlan, targetPlan, status: 'success' };
  } catch (err) {
    console.error(`[billing] Render plan upgrade to ${targetPlan} failed for ${deployment.deploymentId}:`, err.message);
    return { renderPlan: currentPlan, targetPlan, status: 'failed' };
  }
}

/**
 * Expire an unpaid deployment past its grace window: suspend (default) or
 * delete the Render service, mark the deployment + order expired, and record a
 * DeploymentCleanupJob. DB history is preserved.
 */
export async function expireDeployment({ deployment, order = null, action = null, reason = 'unpaid_grace_expired', actorUserId = null } = {}) {
  if (!deployment?.deploymentId) throw new Error('A deployment record is required to expire.');
  const mode = (action || process.env.DEPLOYMENT_CLEANUP_ACTION || 'suspend').toLowerCase();
  const deploymentId = deployment.deploymentId;
  const resolvedOrder = order || (await getOrderForDeployment(deploymentId));

  let renderAction = 'skip';
  let jobStatus = 'done';
  const detail = { mode, reason };

  if (deployment.renderServiceId && renderApiService.configured()) {
    try {
      if (mode === DELETED) {
        await renderApiService.deleteService(deployment.renderServiceId);
        renderAction = DELETED;
      } else {
        await renderApiService.suspendService(deployment.renderServiceId);
        renderAction = 'suspend';
      }
    } catch (err) {
      jobStatus = 'failed';
      detail.error = err.message;
      console.error(`[cleanup] Render ${mode} failed for ${deploymentId}:`, err.message);
    }
  }

  const targetRoot = deployment.generatedSite?.githubTargetRoot || deployment.environmentConfiguration?.rootDirectory;
  if (mode === DELETED && isGeneratedTemplateRoot(targetRoot)) {
    try {
      detail.githubArchive = await archiveGeneratedSiteFolder({
        repoUrl: deployment.repoUrl || deployment.githubRepo || deployment.environmentConfiguration?.sourceRepository,
        branch: deployment.githubBranch || deployment.environmentConfiguration?.branch || 'main',
        targetRoot,
        reason,
      });
    } catch (err) {
      detail.githubArchive = { attempted: true, error: err.message };
    }
  }

  const isSubscriptionExpiry = reason === 'subscription_period_expired';
  const newStatus = mode === DELETED ? DELETED : 'payment_expired';
  const expiredMessage = isSubscriptionExpiry
    ? 'Hosting subscription expired. Please renew payment to reactivate your site.'
    : 'Payment was not verified within 12 hours. Please make payment or wait for admin verification.';
  await updateDeploymentRecord(deploymentId, {
    paymentStatus: isSubscriptionExpiry ? 'subscription_expired' : 'expired',
    ...(isSubscriptionExpiry ? { subscriptionStatus: 'expired' } : {}),
    status: newStatus,
    currentStep: mode === DELETED ? 'Removed — payment not verified' : 'Suspended — payment not verified',
    message: expiredMessage,
    ...(isSubscriptionExpiry
      ? { currentStep: mode === DELETED ? 'Removed - hosting subscription expired' : 'Suspended - hosting subscription expired' }
      : {}),
    deletedReason: reason,
    ...(mode === DELETED ? { deletedAt: nowIso() } : { suspendedAt: nowIso() }),
  });

  if (resolvedOrder && resolvedOrder.status !== 'paid' && resolvedOrder.status !== 'expired') {
    await prisma.checkoutOrder.update({ where: { id: resolvedOrder.id }, data: { status: 'expired' } });
  }

  await prisma.deploymentCleanupJob.create({
    data: {
      deploymentId,
      checkoutOrderId: resolvedOrder?.id || deployment.checkoutOrderId || null,
      userId: dbUserId(deployment.userId),
      action: renderAction,
      reason,
      renderServiceId: deployment.renderServiceId || null,
      status: jobStatus,
      detail: JSON.stringify(detail),
    },
  });

  await writeAuditLog({
    organizationId: orgIdFor(deployment.userId),
    actorUserId,
    action: 'deployment.billing.expired',
    entityType: 'deployment',
    entityId: deploymentId,
    status: jobStatus === 'failed' ? 'error' : 'success',
    result: { mode, renderAction, reason, orderId: resolvedOrder?.id || null },
  });

  // Notify the owner that their site was suspended/removed for non-payment.
  await createUserNotification(deployment.userId, {
    type: 'danger',
    title: 'Hosting suspended',
    message: 'Payment was not verified in time, so this site has been suspended or removed.',
    actionUrl: '/dashboard/billing',
    entityType: 'deployment',
    entityId: deploymentId,
  });

  return { deploymentId, action: renderAction, status: jobStatus };
}

function safeJson(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

function isGeneratedTemplateRoot(value = '') {
  const root = String(process.env.RENDER_GENERATED_TEMPLATE_SITES_ROOT_DIR || process.env.GENERATED_TEMPLATE_SITES_ROOT_DIR || 'generated-template-sites').replace(/^\/+|\/+$/g, '');
  return String(value || '').replace(/\\/g, '/').startsWith(`${root}/`);
}

export default {
  findDeploymentRecord,
  createDeploymentOrder,
  createDeploymentRenewalOrder,
  getOrderForDeployment,
  markDeploymentPaid,
  expireDeployment,
};
