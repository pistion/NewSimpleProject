/**
 * paymentVerificationGuards.js
 *
 * Small, shared assertions that enforce the core payment-security rule:
 *
 *   A deployment/order/subscription may ONLY be tagged paid from a verified
 *   signal — a completed PayPal capture/webhook whose amount matches the order,
 *   or an explicit admin approval/mark-paid. Selecting a tier, creating a
 *   checkout/PayPal order, uploading a receipt, or claiming the promo never
 *   constitute payment.
 *
 * Used by deploymentPaypalService.captureDeploymentPaypalOrder,
 * deploymentBillingService.markDeploymentPaid, the PayPal webhook handler, and
 * the admin receipt-approval path.
 */
import { getBillingTier, defaultTierId } from '../config/deploymentBilling.js';

/** Verified PayPal vias — each REQUIRES a provider capture id. */
const PAYPAL_VERIFIED_VIAS = new Set(['paypal', 'paypal_webhook']);

/** Admin-actor vias — each REQUIRES an actorUserId (an authenticated admin). */
const ADMIN_VERIFIED_VIAS = new Set([
  'manual_admin_approval',
  'admin_mark_paid',
  'admin_manual_renewal',
  'admin_billing_approval',
]);

/** Order statuses from which a payment may legitimately be finalized. */
const PAYABLE_STATUSES = new Set(['pending', 'payment_uploaded', 'provider_confirmed', 'paid']);

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status, expose: true });
}

function safeJson(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

/** Throw unless `order` (if present) is attached to `deploymentId`. */
export function assertOrderBelongsToDeployment(order, deploymentId) {
  if (order?.deploymentId && deploymentId && order.deploymentId !== deploymentId) {
    throw httpError('Checkout order does not belong to this deployment.', 400);
  }
}

/** Throw unless `order` is in a state from which payment may be finalized. */
export function assertOrderPayable(order) {
  if (!order) return; // admin override paths may have no order; checked separately.
  if (!PAYABLE_STATUSES.has(order.status)) {
    throw httpError(`Order is not payable in its current state (${order.status}).`, 409);
  }
}

/**
 * Throw unless the (via, providerCaptureId, actorUserId) triple is a genuinely
 * verified payment signal. This is the gate that keeps "selected / uploaded /
 * claimed" from ever becoming "paid".
 */
export function assertVerifiedPaymentSignal({ via, providerCaptureId = null, actorUserId = null } = {}) {
  if (PAYPAL_VERIFIED_VIAS.has(via)) {
    if (!providerCaptureId) {
      throw httpError('PayPal payment cannot be tagged paid without a verified capture id.', 400);
    }
    return { kind: 'paypal' };
  }
  if (ADMIN_VERIFIED_VIAS.has(via)) {
    if (!actorUserId) {
      throw httpError('Admin payment approval requires an authenticated admin.', 403);
    }
    return { kind: 'admin' };
  }
  if (via === 'manual_receipt' || via === 'receipt_upload' || via === 'manual') {
    throw httpError('Receipt upload is not payment approval.', 400);
  }
  throw httpError(`Refusing to mark paid from an unverified payment signal (${via || 'unknown'}).`, 400);
}

/** Whether this via is an admin override that may proceed without a checkout order. */
export function isAdminVia(via) {
  return ADMIN_VERIFIED_VIAS.has(via);
}

/** The paid tier id is read from the ORDER metadata first (source of truth). */
export function getPaidTierFromOrder(order, fallbackTierId = defaultTierId) {
  const tierId = (order ? safeJson(order.metadata).billingTierId : null) || fallbackTierId;
  return tierId;
}

/**
 * Throw unless a captured amount/currency matches the order's tier processor
 * charge. Returns the matched tier on success.
 */
export function assertAmountMatchesTier({ order, amount, currency } = {}) {
  const tier = getBillingTier(getPaidTierFromOrder(order));
  if (String(currency) !== String(tier.processorCurrency) || String(amount) !== String(tier.processorAmount)) {
    throw httpError('Payment amount mismatch. Contact support.', 400);
  }
  return tier;
}

export default {
  assertOrderBelongsToDeployment,
  assertOrderPayable,
  assertVerifiedPaymentSignal,
  assertAmountMatchesTier,
  getPaidTierFromOrder,
  isAdminVia,
};
