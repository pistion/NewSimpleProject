/**
 * Plan catalog — the simple, real hosting plans for the paid MVP.
 *
 * This replaces the previous fake "Growth" plan + invoice mock data. Each plan
 * declares whether it can deploy hosting and how many sites it allows.
 *
 *  - `free`     : signed-in but not paying — cannot deploy. Default for new users.
 *  - paid plans : can deploy, with an increasing site quota.
 *
 * Prices mirror the hosting cost tiers already used by the checkout flow in
 * server.js (hostingActualCostCents).
 */

export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    priceMonthlyCents: 0,
    currency: 'USD',
    canDeploy: false,
    siteQuota: 0,
    description: 'Explore the builder. Choose a paid plan to publish a live site.',
  },
  {
    id: 'starter',
    name: 'Starter',
    priceMonthlyCents: 700,
    currency: 'USD',
    canDeploy: true,
    siteQuota: 1,
    description: 'Host a single site with ZIP or GitHub deploys.',
  },
  {
    id: 'standard',
    name: 'Standard',
    priceMonthlyCents: 2500,
    currency: 'USD',
    canDeploy: true,
    siteQuota: 5,
    description: 'Host up to 5 sites with ZIP or GitHub deploys.',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthlyCents: 8500,
    currency: 'USD',
    canDeploy: true,
    siteQuota: 25,
    description: 'Host up to 25 sites for agencies and power users.',
  },
];

export const DEFAULT_PLAN_ID = 'free';

/** Look up a plan by id, falling back to the free plan for unknown/empty ids. */
export function getPlan(planId) {
  const id = String(planId || '').trim().toLowerCase();
  return PLANS.find((plan) => plan.id === id) || PLANS.find((plan) => plan.id === DEFAULT_PLAN_ID);
}

/** Public plan list (safe to return from the API). */
export function listPlans() {
  return PLANS.map((plan) => ({ ...plan }));
}
