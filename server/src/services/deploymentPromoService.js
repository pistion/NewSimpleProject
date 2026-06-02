/**
 * deploymentPromoService.js
 *
 * Tracks how many of the K50 launch-promo slots (promo_50) are taken so the
 * deploy flow can offer the promo only while slots remain, and auto-fall-back
 * to standard_200 once they are gone.
 *
 * A slot is considered "used" by a deployment CheckoutOrder whose metadata
 * billingTierId === 'promo_50' and that is either:
 *   - paid (settled — a real customer), or
 *   - payment_uploaded (receipt awaiting admin review), or
 *   - pending and not yet past its grace deadline (dueAt in the future).
 * Pending-but-expired promos free their slot again.
 */
import { prisma } from './db.js';
import { getBillingTier, defaultTierId, promoTierId, promoLimit } from '../config/deploymentBilling.js';

function safeJson(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

/** Count promo slots used + paid breakdown across all deployment orders. */
export async function getPromoUsage() {
  const orders = await prisma.checkoutOrder.findMany({
    where: { type: 'deployment', status: { in: ['pending', 'payment_uploaded', 'paid'] } },
    select: { status: true, dueAt: true, metadata: true },
  });

  const now = Date.now();
  let used = 0;
  let paidPromo = 0;
  let paidStandard = 0;

  for (const o of orders) {
    const tierId = safeJson(o.metadata).billingTierId || defaultTierId;
    const isPromo = tierId === promoTierId;

    if (o.status === 'paid') {
      if (isPromo) { paidPromo += 1; used += 1; }
      else paidStandard += 1;
      continue;
    }
    if (!isPromo) continue;

    if (o.status === 'payment_uploaded') { used += 1; continue; }
    if (o.status === 'pending') {
      const due = o.dueAt ? new Date(o.dueAt).getTime() : null;
      if (!due || due >= now) used += 1; // still holding the slot
    }
  }

  const remaining = Math.max(0, promoLimit - used);
  return { limit: promoLimit, used, remaining, available: remaining > 0, paidPromo, paidStandard };
}

export async function canUsePromo() {
  return (await getPromoUsage()).available;
}

/**
 * Resolve the tier to actually bill for a requested tier id.
 * - Requesting promo_50 when slots remain → promo.
 * - Requesting promo_50 when exhausted → standard_200 with a `switched` message.
 * - Anything else → that tier (default standard_200).
 */
export async function resolveRequestedBillingTier(requestedTierId) {
  const usage = await getPromoUsage();

  if (requestedTierId === promoTierId) {
    if (usage.available) {
      return {
        tier: getBillingTier(promoTierId),
        promoApplied: true,
        promoRemaining: Math.max(0, usage.remaining - 1),
        switched: false,
        message: null,
      };
    }
    return {
      tier: getBillingTier(defaultTierId),
      promoApplied: false,
      promoRemaining: 0,
      switched: true,
      message: 'Launch promo slots are full. Standard K200 hosting applies.',
    };
  }

  const tier = getBillingTier(requestedTierId || defaultTierId);
  return {
    tier,
    promoApplied: tier.promo === true,
    promoRemaining: usage.remaining,
    switched: false,
    message: null,
  };
}

export default { getPromoUsage, canUsePromo, resolveRequestedBillingTier };
