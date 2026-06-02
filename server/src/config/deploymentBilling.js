/**
 * deploymentBilling.js — single source of truth for the launch deploy-first rule.
 *
 * Business rule:
 *   - Every ZIP/GitHub deploy launches FIRST on the Render free plan.
 *   - The user gets `graceHours` (12h) of free hosting after deployment.
 *   - The first `promoLimit` (20) launch customers may choose the K50 promo
 *     (promo_50); everyone else pays the standard K200 (standard_200).
 *   - A verified K50 payment upgrades Render to `starter`; K200 → `standard`.
 *   - If unpaid (and not manually approved) within the grace window, the cleanup
 *     service suspends/deletes the Render service and marks the deployment expired.
 *
 * PayPal/card processors cannot settle PGK directly, so we DISPLAY PGK but CHARGE
 * the per-tier processor currency/amount. Override via env if needed.
 */

const graceHours = Number(process.env.DEPLOYMENT_BILLING_GRACE_HOURS || 12);

// ─── Render plan mapping ────────────────────────────────────────────────────
// Single source of truth for which Render web-service plan each billing state
// maps to. Keep this explicit so user/frontend input can never push a paid plan.

/** Billing state → Render plan. */
export const renderPlanMap = {
  trial_free: 'free',
  promo_50: 'starter',
  standard_200: 'standard',
};

/** Every Render plan we permit a service to ever run on. */
export const allowedRenderPlans = new Set([
  'free',
  'starter',
  'standard',
  'pro',
  'pro_plus',
  'pro_max',
  'pro_ultra',
]);

/** Render plan a paid billing tier upgrades to. Unknown tiers default to standard. */
export function renderPlanForBillingTier(tierId) {
  if (tierId === 'promo_50') return renderPlanMap.promo_50;
  if (tierId === 'standard_200') return renderPlanMap.standard_200;
  return 'standard';
}

/** Coerce a plan string to an allowed Render plan, falling back to `fallback`. */
export function normalizeRenderPlan(plan, fallback = 'free') {
  const clean = String(plan || '').toLowerCase();
  return allowedRenderPlans.has(clean) ? clean : fallback;
}

/** Render plan every new deployment launches on (the free window). */
export const initialRenderPlan = process.env.RENDER_INITIAL_PLAN || renderPlanMap.trial_free;

/** How many K50 promo slots exist for the whole launch. */
export const promoLimit = Number(process.env.DEPLOYMENT_PROMO_LIMIT || 20);

// ─── Pricing tiers ────────────────────────────────────────────────────────────

const TIERS = {
  promo_50: {
    id: 'promo_50',
    label: 'Launch promo (first 20)',
    amountCents: 5000,
    amount: 50,
    currency: 'PGK',
    promo: true,
    promoLimit,
    renderPlanAfterPayment: renderPlanMap.promo_50,
    processorCurrency: (process.env.DEPLOYMENT_PROMO_PROCESSOR_CURRENCY || 'USD').toUpperCase(),
    // Roughly K50 ≈ US$15.
    processorAmount: String(process.env.DEPLOYMENT_PROMO_PROCESSOR_AMOUNT || '15.00'),
  },
  standard_200: {
    id: 'standard_200',
    label: 'Standard hosting',
    amountCents: 20000,
    amount: 200,
    currency: 'PGK',
    promo: false,
    renderPlanAfterPayment: renderPlanMap.standard_200,
    processorCurrency: (process.env.DEPLOYMENT_STANDARD_PROCESSOR_CURRENCY || 'USD').toUpperCase(),
    // Roughly K200 ≈ US$60.
    processorAmount: String(process.env.DEPLOYMENT_STANDARD_PROCESSOR_AMOUNT || '60.00'),
  },
};

export const billingTiers = TIERS;
export const defaultTierId = 'standard_200';
export const promoTierId = 'promo_50';
export { graceHours };

/** Resolve a tier by id, falling back to the standard tier. */
export function getBillingTier(tierId) {
  return TIERS[tierId] || TIERS[defaultTierId];
}

// ─── Back-compat single object ────────────────────────────────────────────────
// Existing callers (paypal verify, manual-receipt fallback amount) still read
// deploymentBilling.*. Keep it locked to the standard tier so an old
// DEPLOYMENT_BILLING_AMOUNT_CENTS env var cannot accidentally revive K100 bills.

const standardTier = TIERS.standard_200;

export const deploymentBilling = {
  amountCents: standardTier.amountCents,
  amount: standardTier.amount,
  currency: standardTier.currency,
  graceHours,
  initialRenderPlan,
  defaultTierId,
  promoLimit,
  // Processor defaults map to the standard tier.
  processorCurrency: standardTier.processorCurrency,
  processorAmount: standardTier.processorAmount,
  tiers: TIERS,
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

/** Milliseconds in the grace window. */
export function graceMs() {
  return graceHours * 60 * 60 * 1000;
}

/** Compute the billing due date from a start time (defaults to now). */
export function computeBillingDueAt(from = Date.now()) {
  const start = from instanceof Date ? from.getTime() : new Date(from).getTime();
  return new Date(start + graceMs());
}

// ─── Public summary ───────────────────────────────────────────────────────────

/** Public-facing billing summary attached to deploy responses. Tier-aware. */
export function billingSummary({
  checkoutOrderId,
  status = 'pending',
  billingDueAt,
  tier = defaultTierId,
  promoRemaining = null,
  switched = false,
  message = null,
} = {}) {
  const t = typeof tier === 'string' ? getBillingTier(tier) : (tier || getBillingTier(defaultTierId));
  return {
    checkoutOrderId: checkoutOrderId || null,
    billingTierId: t.id,
    billingTierLabel: t.label,
    amount: t.amount,
    amountCents: t.amountCents,
    currency: t.currency,
    displayAmount: `K${t.amount}`,
    promoApplied: t.promo === true,
    promoRemaining,
    switched,
    message,
    renderInitialPlan: initialRenderPlan,
    renderPlanAfterPayment: t.renderPlanAfterPayment,
    status,
    graceHours,
    billingDueAt: billingDueAt
      ? (billingDueAt instanceof Date ? billingDueAt.toISOString() : billingDueAt)
      : null,
  };
}

export default deploymentBilling;
