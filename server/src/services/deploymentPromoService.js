/**
 * deploymentPromoService.js
 *
 * Launch promo eligibility is a per-USER property, not a global order count:
 *
 *   - The first `promoLimit` (20) REGISTERED users are promo-eligible
 *     (User.promoEligible / User.promoSignupRank, set at registration).
 *   - Each eligible user may claim the K50 promo (promo_50) exactly ONCE.
 *   - The claim is finalized only after a verified payment, which stamps
 *     User.promoClaimedAt / promoClaimedOrderId / promoClaimedDeploymentId.
 *   - After claiming, every future deployment for that user is standard K200.
 *   - Users registered after the first 20 are never promo-eligible.
 *
 * The old global CheckoutOrder counting is gone — User.* is the source of truth.
 */
import { prisma } from './db.js';
import { getBillingTier, defaultTierId, promoTierId, promoLimit } from '../config/deploymentBilling.js';

function safeJson(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

/** Real DB user id (the dev/local-user fallback has no row). */
function dbUserId(userId) {
  return userId && userId !== 'local-user' ? userId : null;
}

/**
 * Whether the user currently holds an unsettled promo claim (a pending or
 * receipt-uploaded promo_50 order). Used to enforce one active promo claim at a
 * time so a user can't open several K50 orders.
 */
export async function hasActivePromoOrder(userId) {
  const id = dbUserId(userId);
  if (!id) return false;
  const orders = await prisma.checkoutOrder.findMany({
    where: { userId: id, type: 'deployment', status: { in: ['pending', 'payment_uploaded'] } },
    select: { metadata: true },
  });
  return orders.some((o) => safeJson(o.metadata).billingTierId === promoTierId);
}

/**
 * Per-user promo status — the single source of truth the billing UI consumes.
 * @returns {{ eligible, signupRank, limit, used, claimedAt, claimedOrderId,
 *             claimedDeploymentId, canClaim, hasActivePromoOrder, message }}
 */
export async function getUserPromoStatus(userId) {
  const id = dbUserId(userId);
  const base = {
    eligible: false,
    signupRank: null,
    limit: promoLimit,
    used: false,
    claimedAt: null,
    claimedOrderId: null,
    claimedDeploymentId: null,
    canClaim: false,
    hasActivePromoOrder: false,
    message: 'Launch promo is reserved for the first 20 registered customers.',
  };
  if (!id) return base;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      promoEligible: true, promoSignupRank: true, promoClaimedAt: true,
      promoClaimedOrderId: true, promoClaimedDeploymentId: true,
    },
  });
  if (!user) return base;

  const used = Boolean(user.promoClaimedAt);
  const eligible = Boolean(user.promoEligible);
  const activeOrder = used ? false : await hasActivePromoOrder(id);
  const canClaim = eligible && !used && !activeOrder;

  let message;
  if (!eligible) message = 'Launch promo is reserved for the first 20 registered customers.';
  else if (used) message = 'K50 launch promo already claimed on this account.';
  else if (activeOrder) message = 'You already have a pending K50 promo claim. Pay or let it expire before claiming another.';
  else message = 'You can claim the K50 launch promo on one deployment.';

  return {
    eligible,
    signupRank: user.promoSignupRank ?? null,
    limit: promoLimit,
    used,
    claimedAt: user.promoClaimedAt ? user.promoClaimedAt.toISOString?.() || user.promoClaimedAt : null,
    claimedOrderId: user.promoClaimedOrderId || null,
    claimedDeploymentId: user.promoClaimedDeploymentId || null,
    canClaim,
    hasActivePromoOrder: activeOrder,
    message,
  };
}

/**
 * Resolve the tier to actually bill for, based on the user's promo status.
 *
 * - promo_50 + user can claim  → promo_50.
 * - promo_50 + cannot claim    → standard_200 with an explanatory message.
 * - standard_200               → standard_200.
 * - no requested tier          → standard_200 (promo is never auto-applied; the
 *                                user must explicitly choose "Claim K50 Promo").
 *
 * @param {{ userId, requestedTierId, deploymentId }} args
 */
export async function resolveRequestedBillingTier({ userId, requestedTierId, deploymentId } = {}) {
  const status = await getUserPromoStatus(userId);

  if (requestedTierId === promoTierId) {
    if (status.canClaim) {
      return {
        tier: getBillingTier(promoTierId),
        promoApplied: true,
        promoStatus: status,
        switched: false,
        promoWillBeMarkedUsedOnPayment: true,
        message: null,
      };
    }
    return {
      tier: getBillingTier(defaultTierId),
      promoApplied: false,
      promoStatus: status,
      switched: true,
      promoWillBeMarkedUsedOnPayment: false,
      message: status.used
        ? 'Your K50 launch promo has already been used. Standard K200 hosting applies.'
        : status.hasActivePromoOrder
          ? 'You already have a pending K50 promo claim. Standard K200 hosting applies until it is settled or expires.'
          : 'Your K50 launch promo is not available on this account. Standard K200 hosting applies.',
    };
  }

  const tier = getBillingTier(requestedTierId || defaultTierId);
  return {
    tier,
    promoApplied: tier.promo === true && status.canClaim,
    promoStatus: status,
    switched: false,
    promoWillBeMarkedUsedOnPayment: false,
    message: null,
  };
}

/**
 * Admin/global promo snapshot for the overview dashboard. Now derived from
 * registered users (eligible + claimed), plus a paid-order revenue mix.
 */
export async function getPromoUsage() {
  const [eligibleUsers, claimedUsers, paidOrders] = await Promise.all([
    prisma.user.count({ where: { promoEligible: true } }),
    prisma.user.count({ where: { NOT: { promoClaimedAt: null } } }),
    prisma.checkoutOrder.findMany({ where: { type: 'deployment', status: 'paid' }, select: { metadata: true } }),
  ]);

  let paidPromo = 0;
  let paidStandard = 0;
  for (const o of paidOrders) {
    if (safeJson(o.metadata).billingTierId === promoTierId) paidPromo += 1;
    else paidStandard += 1;
  }

  const remaining = Math.max(0, eligibleUsers - claimedUsers);
  return {
    limit: promoLimit,
    eligibleUsers,
    claimedUsers,
    used: claimedUsers,
    remaining,
    available: remaining > 0,
    paidPromo,
    paidStandard,
  };
}

export async function canUsePromo(userId) {
  return (await getUserPromoStatus(userId)).canClaim;
}

export default { getUserPromoStatus, resolveRequestedBillingTier, getPromoUsage, canUsePromo, hasActivePromoOrder };
