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
import { deploymentBilling } from '../config/deploymentBilling.js';

function dbUserId(userId) {
  return userId && userId !== 'local-user' ? userId : null;
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

      const orders = orderRows.map((o) => ({
        id: o.id,
        deploymentId: o.deploymentId,
        status: o.status,
        totalAmountCents: o.totalAmountCents,
        currency: o.currency,
        dueAt: o.dueAt,
        paidAt: o.paidAt,
        provider: o.provider,
        receipts: o.receipts,
      }));

      const deployments = ownDeployments.map((d) => ({
        deploymentId: d.deploymentId,
        serviceName: d.serviceName || null,
        source: d.source || null,
        liveUrl: d.liveUrl || null,
        paymentStatus: d.paymentStatus || 'none',
        billingDueAt: d.billingDueAt || null,
        checkoutOrderId: d.checkoutOrderId || null,
      }));

      res.ok({
        pricing: {
          deploymentAmount: deploymentBilling.amount,
          deploymentCurrency: deploymentBilling.currency,
          displayAmount: `K${deploymentBilling.amount}`,
          graceHours: deploymentBilling.graceHours,
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
