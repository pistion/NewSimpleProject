/**
 * BillingController
 * Simple plan-based billing for the paid MVP. No fake invoice/subscription data:
 * the summary answers the questions the launch surface actually needs —
 * current plan, available plans, whether the user can deploy, and site quota.
 */

import { listPlans } from '../config/plans.js';
import { countUserSites, resolveUserPlan } from '../middleware/planGate.js';

const BillingController = {
  getSummary: async (req, res, next) => {
    try {
      const plan = await resolveUserPlan(req.user?.id);
      const sitesUsed = await countUserSites(req.user?.id);
      res.ok({
        currentPlan: {
          id: plan.id,
          name: plan.name,
          priceMonthlyCents: plan.priceMonthlyCents,
          currency: plan.currency,
        },
        availablePlans: listPlans(),
        canDeploy: plan.canDeploy,
        siteQuota: plan.siteQuota,
        sitesUsed,
        sitesRemaining: Math.max(0, plan.siteQuota - sitesUsed),
      });
    } catch (error) {
      next(error);
    }
  },

  listPlans: async (req, res, next) => {
    try {
      res.ok(listPlans());
    } catch (error) {
      next(error);
    }
  },
};

export default BillingController;
