import * as vultr from './vultrApiService.js';

const MARKUP_PERCENT = Number(process.env.PLATFORM_MARKUP_PERCENT ?? 30);

export function calcPricing(planMonthlyCost) {
  const baseCents = Math.round(planMonthlyCost * 100);
  const mkupCents = Math.round(baseCents * (MARKUP_PERCENT / 100));
  return { baseCents, mkupCents, totalCents: baseCents + mkupCents, markup: MARKUP_PERCENT };
}

/**
 * Public customer quote: final price and currency only. Provider base cost
 * and the exact markup stay internal (calcPricing) — never expose them here.
 */
export async function getQuote(planId, region, osId) {
  const plans = await vultr.listPlans();
  const plan = plans.find((p) => p.id === planId);
  if (!plan) throw Object.assign(new Error(`Plan "${planId}" not found.`), { status: 404 });
  const { totalCents } = calcPricing(plan.monthly_cost);
  return {
    plan: planId, region, osId,
    totalMonthlyCostCents: totalCents,
    currency: 'USD',
    monthlyPrice: `$${(totalCents / 100).toFixed(2)}`,
  };
}
