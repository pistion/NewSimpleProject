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
 * Self-heal a single user that registered before the promo fields existed
 * (promoSignupRank is null). Eligibility is a deterministic function of
 * registration order, so compute the rank from createdAt and persist it once.
 * Returns the user with promoSignupRank/promoEligible filled in.
 */
async function ensureUserPromoFields(user, id) {
  if (user.promoSignupRank != null) return user;
  const priorCount = await prisma.user.count({ where: { createdAt: { lt: user.createdAt } } });
  const signupRank = priorCount + 1;
  const promoEligible = signupRank <= promoLimit;
  try {
    await prisma.user.update({ where: { id }, data: { promoSignupRank: signupRank, promoEligible } });
  } catch { /* best-effort backfill */ }
  return { ...user, promoSignupRank: signupRank, promoEligible };
}

/**
 * Bulk-heal any users missing a signup rank (idempotent: a no-op once every
 * user has one). Keeps the admin promo stats accurate for accounts created
 * before the launch-promo fields were added.
 */
async function backfillMissingPromoRanks() {
  const missing = await prisma.user.count({ where: { promoSignupRank: null } });
  if (missing === 0) return;
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, promoSignupRank: true } });
  let rank = 0;
  for (const u of users) {
    rank += 1;
    if (u.promoSignupRank == null) {
      await prisma.user.update({
        where: { id: u.id },
        data: { promoSignupRank: rank, promoEligible: rank <= promoLimit },
      }).catch(() => {});
    }
  }
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

  let user = await prisma.user.findUnique({
    where: { id },
    select: {
      promoEligible: true, promoSignupRank: true, promoClaimedAt: true,
      promoClaimedOrderId: true, promoClaimedDeploymentId: true, createdAt: true,
    },
  });
  if (!user) return base;
  // Back-fill eligibility for accounts created before the promo fields existed.
  user = await ensureUserPromoFields(user, id);

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
  // Heal any legacy users missing a signup rank so eligibility counts are right.
  await backfillMissingPromoRanks().catch(() => {});

  const [totalUsers, eligibleUsers, claimedUsers, paidOrders] = await Promise.all([
    prisma.user.count(),
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

  // A promo "slot" is consumed when a user CLAIMS the K50 promo. With 20 launch
  // slots and 0 claims, 20 remain — independent of how many of the first 20 have
  // registered yet.
  const remaining = Math.max(0, promoLimit - claimedUsers);
  return {
    limit: promoLimit,
    totalUsers,
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
