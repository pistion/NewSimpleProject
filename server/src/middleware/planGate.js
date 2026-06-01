import { getPlan } from '../config/plans.js';
import { prisma } from '../services/db.js';
import { readHostingStore } from '../services/hostingStore.js';

/**
 * Resolve the plan for the authenticated user. Falls back to the free plan
 * when the user is unknown or has no stored plan.
 */
export async function resolveUserPlan(userId) {
  if (!userId) return getPlan('free');
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return getPlan(user?.planId);
  } catch {
    return getPlan('free');
  }
}

/** Count the sites (deployments) the user has already created. */
export async function countUserSites(userId) {
  if (!userId) return 0;
  const store = await readHostingStore();
  return (store.deployments || []).filter((d) => d.userId === userId && d.status !== 'deleted').length;
}

/**
 * Requires the authenticated user's plan to allow deploying. Unpaid/free users
 * get a 402 payment_required telling them to choose a hosting plan.
 */
export function requireActivePlan(req, res, next) {
  resolveUserPlan(req.user?.id)
    .then((plan) => {
      if (plan.canDeploy) {
        req.plan = plan;
        return next();
      }
      return res.status(402).json({
        success: false,
        status: 'payment_required',
        error: {
          code: 'PAYMENT_REQUIRED',
          message: 'Choose a hosting plan to deploy your site.',
        },
        currentPlan: plan.id,
        requestId: req.id,
      });
    })
    .catch(next);
}

/**
 * Requires the user to be under their plan's site quota. Must run after
 * requireActivePlan so req.plan is populated.
 */
export function requireSiteQuota(req, res, next) {
  const plan = req.plan;
  if (!plan) return next(new Error('requireSiteQuota must run after requireActivePlan.'));
  countUserSites(req.user?.id)
    .then((used) => {
      if (used < plan.siteQuota) return next();
      return res.status(402).json({
        success: false,
        status: 'payment_required',
        error: {
          code: 'SITE_QUOTA_EXCEEDED',
          message: `Your ${plan.name} plan allows ${plan.siteQuota} site${plan.siteQuota === 1 ? '' : 's'}. Upgrade your plan to deploy more.`,
        },
        currentPlan: plan.id,
        siteQuota: plan.siteQuota,
        sitesUsed: used,
        requestId: req.id,
      });
    })
    .catch(next);
}
