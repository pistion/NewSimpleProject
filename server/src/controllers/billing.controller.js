/**
 * BillingController — deploy-first K100 billing summary for the signed-in user.
 *
 * The Billing page shows the launch pricing (flat K100 per deploy, deploy-first
 * with a 12-hour grace window), the user's own deployment bills, and the
 * payment surface. Normal users only ever see their OWN orders/deployments;
 * admins use /api/admin for the all-tenant view.
 */

import { prisma } from '../services/db.js';
import { readHostingStore } from '../services/hostingStore.js';
import renderApiService from '../services/renderApiService.js';
import { deploymentBilling, billingTiers, initialRenderPlan } from '../config/deploymentBilling.js';
import { getPromoUsage, getUserPromoStatus } from '../services/deploymentPromoService.js';

function dbUserId(userId) {
  return userId && userId !== 'local-user' ? userId : null;
}

function safeJson(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

function providerStatus() {
  return {
    renderConfigured: renderApiService.configured(),
    renderApiKeyPresent: Boolean(process.env.RENDER_API_KEY),
    renderOwnerIdPresent: Boolean(process.env.RENDER_OWNER_ID),
    paypalConfigured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    manualReceiptUpload: true,
  };
}

const BillingController = {
  getSummary: async (req, res, next) => {
    try {
      const userId = req.user?.id || null;

      // 1. The user's own platform deployments (the JSON store is user-scoped).
      const store = await readHostingStore();
      const ownDeployments = (store.deployments || []).filter(
        (d) => d.platformDeployed === true && d.userId === userId,
      );
      const ownDeploymentIds = ownDeployments.map((d) => d.deploymentId).filter(Boolean);

      // 2. Their K100 orders — tied to owned deployments (robust ownership) and,
      //    as a fallback, orders carrying their userId.
      const orderRows = await prisma.checkoutOrder.findMany({
        where: {
          type: 'deployment',
          OR: [
            ...(ownDeploymentIds.length ? [{ deploymentId: { in: ownDeploymentIds } }] : []),
            ...(dbUserId(userId) ? [{ userId: dbUserId(userId) }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        include: { receipts: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, fileName: true, createdAt: true } } },
      });

      const orders = orderRows.map((o) => {
        const meta = safeJson(o.metadata);
        return {
          id: o.id,
          deploymentId: o.deploymentId,
          status: o.status,
          totalAmountCents: o.totalAmountCents,
          currency: o.currency,
          displayAmount: `${o.currency || 'PGK'} ${((o.totalAmountCents || 0) / 100).toFixed(0)}`,
          billingTierId: meta.billingTierId || null,
          billingTierLabel: meta.billingTierLabel || null,
          promoApplied: meta.promoApplied === true,
          renderPlanAfterPayment: meta.renderPlanAfterPayment || null,
          dueAt: o.dueAt,
          paidAt: o.paidAt,
          provider: o.provider,
          receipts: o.receipts,
        };
      });

      const deployments = ownDeployments.map((d) => ({
        deploymentId: d.deploymentId,
        serviceName: d.serviceName || null,
        source: d.source || null,
        liveUrl: d.liveUrl || null,
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
        checkoutOrderId: d.checkoutOrderId || null,
      }));

      const [promo, userPromo] = await Promise.all([getPromoUsage(), getUserPromoStatus(userId)]);
      const tiers = Object.values(billingTiers).map((t) => ({
        id: t.id,
        label: t.label,
        amount: t.amount,
        currency: t.currency,
        displayAmount: `K${t.amount}`,
        promo: t.promo === true,
        renderPlanAfterPayment: t.renderPlanAfterPayment,
        // Promo tier is selectable only when THIS user can still claim it.
        available: t.promo ? userPromo.canClaim : true,
      }));

      res.ok({
        pricing: {
          deploymentAmount: deploymentBilling.amount,
          deploymentCurrency: deploymentBilling.currency,
          displayAmount: `K${deploymentBilling.amount}`,
          graceHours: deploymentBilling.graceHours,
          initialRenderPlan,
          tiers,
          // Global stats (analytics) plus this user's promo entitlement.
          promoUsage: { limit: promo.limit, used: promo.used, remaining: promo.remaining, available: promo.available },
          promo: userPromo,
          freeHostingMessage: 'Your site starts on free hosting for 12 hours. After payment is verified, we upgrade your hosting plan and redeploy.',
        },
        orders,
        deployments,
        provider: providerStatus(),
      });
    } catch (error) {
      next(error);
    }
  },
};

export default BillingController;
