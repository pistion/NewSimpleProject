/**
 * renderCosts.js — INTERNAL provider-cost estimates.
 *
 * Render hosts the deployed sites and charges Glondia's own Render account.
 * Customer payment (K50 promo or standard K200) goes to Glondia and is never split
 * to Render. These figures are used ONLY for internal/admin margin reporting —
 * they are never billed to the customer.
 *
 * Configure via env:
 *   RENDER_STANDARD_COST_CENTS  (default 0)  — estimated monthly cost per web service
 *   RENDER_STATIC_COST_CENTS    (default 0)  — estimated cost per static site
 *   RENDER_COST_CURRENCY        (default USD)
 */

const webServiceCostCents = Number(process.env.RENDER_STANDARD_COST_CENTS || 0);
const staticSiteCostCents = Number(process.env.RENDER_STATIC_COST_CENTS || 0);
const currency = (process.env.RENDER_COST_CURRENCY || 'USD').toUpperCase();

export const renderCosts = {
  web_service_estimated_cost_cents: webServiceCostCents,
  static_site_estimated_cost_cents: staticSiteCostCents,
  currency,
};

/** Estimated internal Render cost (cents) for a given service type. */
export function estimatedProviderCostCents(serviceType) {
  return serviceType === 'web_service' ? webServiceCostCents : staticSiteCostCents;
}

export default renderCosts;
