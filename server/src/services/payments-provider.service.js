/**
 * payments-provider.service.js
 *
 * All payment order/capture business logic extracted from server.js.
 * Handles PayPal checkout orders for domain registration and hosting deployment.
 */

import {
  checkSpaceshipAvailability,
  registerSpaceshipDomain,
  saveSpaceshipContact,
  cleanDomainName,
  getSpaceshipSettings,
} from './providerSpaceship.service.js';
import deploymentService from './deploymentService.js';
import { makeId, mutateHostingStore, nowIso, readHostingStore } from './hostingStore.js';

// ── Fallback TLD pricing (used when registrar does not return a price) ─────────
export const FALLBACK_TLD_PRICE_CENTS = new Map([
  ['.com', 1499], ['.com.pg', 4999], ['.com.fj', 5999], ['.com.vu', 4499],
  ['.co', 2499], ['.io', 3999], ['.app', 1699], ['.dev', 1499],
  ['.org', 1249], ['.net', 1199], ['.store', 499], ['.shop', 199],
]);
// Pre-sorted longest-first so multi-part TLDs (.com.pg) match before shorter ones (.com)
export const FALLBACK_TLD_SUFFIXES = [...FALLBACK_TLD_PRICE_CENTS.keys()].sort((a, b) => b.length - a.length);

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getPlatformMarkupPercent() {
  const raw = process.env.PLATFORM_MARKUP_PERCENT;
  if (raw === undefined || raw === '') return 30;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 30;
  return value;
}

export function getPaypalClientSettings() {
  return {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    configured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    sandbox: String(process.env.PAYPAL_SANDBOX || 'true').toLowerCase() !== 'false',
    markupPercent: getPlatformMarkupPercent(),
  };
}

export function domainActualPriceCents(domain, availabilityRow) {
  const premium = availabilityRow?.pricing?.amount;
  if (premium != null && Number.isFinite(Number(premium))) return Math.max(0, Math.round(Number(premium)));
  const tld = FALLBACK_TLD_SUFFIXES.find((suffix) => domain.endsWith(suffix));
  if (!tld) throw httpError(`No registrar price is configured for ${domain}.`, 400);
  return FALLBACK_TLD_PRICE_CENTS.get(tld);
}

export function hostingActualCostCents(input = {}) {
  const supplied = Number(input.actualAmountCents || input.hostingCostCents || 0);
  if (Number.isFinite(supplied) && supplied > 0) return Math.round(supplied);
  const plan = String(input.plan || 'starter').toLowerCase();
  if (plan === 'free') return 0;
  if (plan === 'standard') return 2500;
  if (plan === 'pro') return 8500;
  return 700;
}

export function sanitizeContact(input = {}) {
  return {
    firstName: String(input.firstName || '').trim(),
    lastName: String(input.lastName || '').trim(),
    company: String(input.company || '').trim() || undefined,
    email: String(input.email || '').trim(),
    phone: String(input.phone || '').trim(),
    address1: String(input.address1 || '').trim(),
    address2: String(input.address2 || '').trim() || undefined,
    city: String(input.city || '').trim(),
    postalCode: String(input.postalCode || '').trim(),
    country: String(input.country || '').trim().toUpperCase(),
  };
}

export function centsToUsd(cents) {
  return (Math.max(0, Math.round(Number(cents) || 0)) / 100).toFixed(2);
}

export function safeReturnUrl(value) {
  const fallback = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
  try {
    const url = new URL(value || fallback);
    if (!['http:', 'https:'].includes(url.protocol)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export function httpError(message, status = 400, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  error.expose = true;
  return error;
}

// ── PayPal auth ───────────────────────────────────────────────────────────────

let paypalTokenCache = { token: '', expiresAt: 0 };

export function assertPayPalConfigured() {
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) return;
  throw httpError('PayPal credentials are not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.', 503);
}

export function paypalBaseUrl() {
  return String(process.env.PAYPAL_SANDBOX || 'true').toLowerCase() === 'false'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export async function getPayPalAccessToken() {
  assertPayPalConfigured();
  if (paypalTokenCache.token && Date.now() < paypalTokenCache.expiresAt) return paypalTokenCache.token;
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError('Failed to authenticate with PayPal.', response.status, payload);
  paypalTokenCache = { token: payload.access_token, expiresAt: Date.now() + Math.max(0, Number(payload.expires_in || 300) - 60) * 1000 };
  return paypalTokenCache.token;
}

export async function paypalHeaders() {
  return {
    Authorization: `Bearer ${await getPayPalAccessToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

// ── PayPal order CRUD ─────────────────────────────────────────────────────────

export async function createPayPalOrder({ checkoutOrderId, type, totalAmountCents, lineItems, amounts, returnUrl, cancelUrl }) {
  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: checkoutOrderId,
      custom_id: `${type}:${checkoutOrderId}`,
      description: type === 'domain_purchase' ? 'Glondia domain registration' : 'Glondia hosting deployment',
      amount: {
        currency_code: 'USD',
        value: centsToUsd(totalAmountCents),
        breakdown: {
          item_total: { currency_code: 'USD', value: centsToUsd(totalAmountCents) },
        },
      },
      items: [
        ...lineItems.map((item) => ({
          name: item.name,
          quantity: '1',
          unit_amount: { currency_code: 'USD', value: centsToUsd(item.actualAmountCents) },
          category: 'DIGITAL_GOODS',
        })),
        ...(amounts.markupAmountCents > 0 ? [{
          name: 'Glondia platform service fee',
          quantity: '1',
          unit_amount: { currency_code: 'USD', value: centsToUsd(amounts.markupAmountCents) },
          category: 'DIGITAL_GOODS',
        }] : []),
      ],
    }],
    application_context: {
      brand_name: 'Glondia',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
      return_url: safeReturnUrl(returnUrl),
      cancel_url: safeReturnUrl(cancelUrl || returnUrl),
    },
  };
  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: await paypalHeaders(),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(payload?.message || 'PayPal order creation failed.', response.status, payload);
  return { id: payload.id, approvalUrl: payload.links?.find((link) => link.rel === 'approve')?.href, payload };
}

export async function capturePayPalOrder(providerOrderId) {
  const id = String(providerOrderId || '').trim();
  if (!id) throw httpError('PayPal order id is required.', 400);
  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {
    method: 'POST',
    headers: await paypalHeaders(),
    body: JSON.stringify({}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(payload?.message || 'PayPal capture failed.', response.status, payload);
  if (payload.status !== 'COMPLETED') throw httpError(`PayPal capture status is ${payload.status || 'unknown'}.`, 409, payload);
  return payload;
}

export async function refundPayPalCapture(captureId) {
  const response = await fetch(`${paypalBaseUrl()}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: 'POST',
    headers: await paypalHeaders(),
    body: JSON.stringify({ note_to_payer: 'Your payment could not be fulfilled and has been refunded.' }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message || 'PayPal refund request failed');
  }
}

// ── Checkout order store helpers ──────────────────────────────────────────────

export async function createCheckoutOrder({ type, user, source, lineItems, metadata }) {
  assertPayPalConfigured();
  const actualAmountCents = lineItems.reduce((sum, item) => sum + item.actualAmountCents, 0);
  const markupPercent = getPlatformMarkupPercent();
  const markupAmountCents = Math.round(actualAmountCents * markupPercent / 100);
  const totalAmountCents = actualAmountCents + markupAmountCents;
  const id = makeId('checkout');
  const amounts = {
    currency: 'USD',
    actualAmountCents,
    markupPercent,
    markupAmountCents,
    totalAmountCents,
    actualAmount: centsToUsd(actualAmountCents),
    markupAmount: centsToUsd(markupAmountCents),
    totalAmount: centsToUsd(totalAmountCents),
  };
  const paypal = await createPayPalOrder({
    checkoutOrderId: id,
    type,
    totalAmountCents,
    lineItems,
    amounts,
    returnUrl: source?.returnUrl,
    cancelUrl: source?.cancelUrl,
  });
  const order = {
    id,
    organizationId: source?.organizationId || user.organizationId || 'local-org',
    userId: user.id || 'local-user',
    type,
    provider: 'paypal',
    providerOrderId: paypal.id,
    status: 'pending',
    currency: 'USD',
    actualAmountCents,
    markupPercent,
    markupAmountCents,
    totalAmountCents,
    amounts,
    lineItems,
    metadata,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await mutateHostingStore((store) => {
    store.checkoutOrders = store.checkoutOrders || [];
    store.payments = store.payments || [];
    store.checkoutOrders.unshift(order);
    return order;
  });
  return { checkoutOrderId: id, providerOrderId: paypal.id, approvalUrl: paypal.approvalUrl, amounts, lineItems };
}

export async function getCheckoutOrder(checkoutOrderId) {
  const id = String(checkoutOrderId || '').trim();
  if (!id) throw httpError('checkoutOrderId is required.', 400);
  const store = await readHostingStore();
  const order = (store.checkoutOrders || []).find((item) => item.id === id);
  if (!order) throw httpError('Checkout order not found.', 404);
  return order;
}

export async function markCheckoutPaid(checkoutOrderId, providerCaptureId, result, user = {}) {
  return mutateHostingStore((store) => {
    const order = (store.checkoutOrders || []).find((item) => item.id === checkoutOrderId);
    if (!order) return result;
    if (order.status === 'paid') return order.result;
    Object.assign(order, { status: 'paid', providerCaptureId, result, updatedAt: nowIso() });
    store.payments = store.payments || [];
    store.payments.unshift({
      id: makeId('pay'),
      checkoutOrderId: order.id,
      organizationId: order.organizationId,
      userId: user.id || order.userId,
      type: order.type,
      provider: 'paypal',
      providerOrderId: order.providerOrderId,
      providerCaptureId,
      status: 'paid',
      currency: order.currency,
      actualAmountCents: order.actualAmountCents,
      markupPercent: order.markupPercent,
      markupAmountCents: order.markupAmountCents,
      totalAmountCents: order.totalAmountCents,
      metadata: order.metadata,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    return result;
  });
}

// ── Domain payment ────────────────────────────────────────────────────────────

function assertSpaceshipConfigured() {
  const settings = getSpaceshipSettings();
  if (!settings.configured) {
    throw httpError(
      'Domain registration is not configured yet. Add SPACESHIP_API_KEY and SPACESHIP_API_SECRET on the server.',
      503
    );
  }
}

export async function createDomainPaymentOrder(input = {}, user = {}) {
  assertSpaceshipConfigured();
  assertPayPalConfigured();

  const domains = Array.isArray(input.domains) ? input.domains : [];
  if (!domains.length) throw httpError('At least one domain is required.', 400);
  const normalized = domains.map((item) => ({
    name: cleanDomainName(item.name || item.hostname || item.domain),
    years: Math.min(Math.max(Number(item.years || 1), 1), 10),
  }));
  // Real availability check before creating any PayPal order.
  const availability = await checkSpaceshipAvailability(normalized.map((item) => item.name));
  const lines = normalized.map((item) => {
    const row = availability.domains.find((candidate) => candidate.domain === item.name);
    if (!row) throw httpError(`Could not verify availability for ${item.name}.`, 502);
    if (!row.available) throw httpError(`${item.name} is no longer available.`, 409);
    const actualAmountCents = domainActualPriceCents(item.name, row) * item.years;
    return { type: 'domain_registration', name: item.name, years: item.years, actualAmountCents };
  });
  return createCheckoutOrder({
    type: 'domain_purchase',
    user,
    source: input,
    lineItems: lines,
    metadata: {
      domains: normalized,
      contact: sanitizeContact(input.contact || {}),
      autoRenew: input.autoRenew !== false,
      privacyProtection: input.privacyProtection !== false,
    },
  });
}

export async function captureDomainPaymentOrder(input = {}, user = {}) {
  assertSpaceshipConfigured();
  assertPayPalConfigured();

  const order = await getCheckoutOrder(input.checkoutOrderId);
  if (order.type !== 'domain_purchase') throw httpError('Checkout order is not for a domain purchase.', 400);
  if (order.status === 'paid') return order.result;

  const domains = order.metadata.domains || [];
  const providerOrderId = input.providerOrderId || input.orderId || order.providerOrderId;

  // Re-check availability BEFORE capturing payment — never charge if the domain is gone.
  if (!domains.length) throw httpError('Checkout order has no domains to register.', 400);
  const availability = await checkSpaceshipAvailability(domains.map((d) => d.name));
  const unavailable = domains.filter((item) => {
    const row = availability.domains.find((r) => r.domain === item.name);
    return !row || !row.available;
  });
  if (unavailable.length) {
    throw httpError(`${unavailable.map((d) => d.name).join(', ')} is no longer available.`, 409);
  }

  // Capture only after provider + availability are confirmed.
  const capturePayload = await capturePayPalOrder(providerOrderId);
  const captureId = capturePayload?.purchase_units?.[0]?.payments?.captures?.[0]?.id;

  const contact = order.metadata.contact || {};
  const createdContact = await saveSpaceshipContact(contact);
  const contactId = createdContact.contactId || createdContact.id;

  let operations;
  try {
    operations = await Promise.all(
      domains.map(async (item) => {
        const registered = await registerSpaceshipDomain(item.name, {
          years: item.years || 1,
          autoRenew: order.metadata.autoRenew !== false,
          privacyProtection: order.metadata.privacyProtection !== false,
          contactId,
        });
        return { domain: item.name, operationId: registered.operationId, status: registered.status };
      })
    );
  } catch (registrationError) {
    if (captureId) await refundPayPalCapture(captureId).catch(() => {});
    throw httpError(`Domain registration failed after payment: ${registrationError.message}. A refund has been requested.`, 500);
  }

  const result = { status: 'paid', checkoutOrderId: order.id, operations, amounts: order.amounts };
  await markCheckoutPaid(order.id, providerOrderId, result, user);
  return result;
}

// ── Hosting payment ───────────────────────────────────────────────────────────

export async function createHostingPaymentOrder(input = {}, user = {}) {
  // New flow: pay for an already-running deployment from the Billing tab
  if (input.deploymentId) {
    const store = await readHostingStore();
    const dep = (store.deployments || []).find((d) => d.deploymentId === input.deploymentId || d.id === input.deploymentId);
    if (!dep) throw httpError('Deployment not found.', 404);
    const existing = (store.checkoutOrders || []).find(
      (o) => o.type === 'hosting_deployment' && o.status === 'paid' && o.metadata?.deploymentId === input.deploymentId
    );
    if (existing) throw httpError('This deployment has already been paid for.', 409);
    const actualAmountCents = hostingActualCostCents(dep);
    return createCheckoutOrder({
      type: 'hosting_deployment',
      user,
      source: input,
      lineItems: [{ type: 'render_deployment', name: dep.serviceName || 'Render hosting', actualAmountCents }],
      metadata: { deploymentId: dep.deploymentId },
    });
  }

  // Legacy flow: deploy-then-pay (kept for compat, no longer called from builder)
  const deploymentPayload = input.deployment || input;
  if (!(deploymentPayload.repoUrl || deploymentPayload.repositoryUrl || deploymentPayload.sourceReference || deploymentPayload.renderServiceId || deploymentPayload.serviceId)) {
    throw httpError('A repository or existing hosting service is required before hosting checkout.', 400);
  }
  const actualAmountCents = hostingActualCostCents(deploymentPayload);
  return createCheckoutOrder({
    type: 'hosting_deployment',
    user,
    source: input,
    lineItems: [{ type: 'render_deployment', name: deploymentPayload.name || deploymentPayload.serviceName || 'Hosting deployment', actualAmountCents }],
    metadata: { deploymentPayload },
  });
}

export async function captureHostingPaymentOrder(input = {}, user = {}) {
  const order = await getCheckoutOrder(input.checkoutOrderId);
  if (order.type !== 'hosting_deployment') throw httpError('Checkout order is not for hosting.', 400);
  if (order.status === 'paid') return order.result;

  const providerOrderId = input.providerOrderId || input.orderId || order.providerOrderId;
  const capturePayload = await capturePayPalOrder(providerOrderId);
  const captureId = capturePayload?.purchase_units?.[0]?.payments?.captures?.[0]?.id;

  // New path: payment for an already-deployed service from the Billing tab
  if (order.metadata?.deploymentId) {
    const result = { status: 'paid', checkoutOrderId: order.id, deploymentId: order.metadata.deploymentId, amounts: order.amounts };
    await markCheckoutPaid(order.id, providerOrderId, result, user);
    await mutateHostingStore((store) => {
      const dep = (store.deployments || []).find((d) => d.deploymentId === order.metadata.deploymentId);
      if (dep) { dep.paymentStatus = 'paid'; dep.updatedAt = nowIso(); }
    });
    return result;
  }

  // Legacy path: deploy-then-pay (kept for compat)
  let deployment;
  try {
    deployment = await deploymentService.createRenderDeployment(order.metadata.deploymentPayload || {}, { userId: user.id || 'local-user' });
  } catch (deployError) {
    if (captureId) await refundPayPalCapture(captureId).catch(() => {});
    throw httpError(`Render deployment failed after payment: ${deployError.message}. A refund has been requested.`, 500);
  }

  const result = { status: 'paid', checkoutOrderId: order.id, deployment, amounts: order.amounts };
  await markCheckoutPaid(order.id, providerOrderId, result, user);
  return result;
}

export async function getHostingPaymentStatus(deploymentId) {
  const GRACE_MS = Number(process.env.PAYMENT_GRACE_HOURS || 24) * 60 * 60 * 1000;
  const store = await readHostingStore();
  const dep = (store.deployments || []).find((d) => d.deploymentId === deploymentId || d.id === deploymentId);
  const paidOrder = (store.checkoutOrders || []).find(
    (o) => o.type === 'hosting_deployment' && o.status === 'paid' && o.metadata?.deploymentId === deploymentId
  );
  const deployedAt = dep?.createdAt ? new Date(dep.createdAt).getTime() : null;
  const deadline = deployedAt ? deployedAt + GRACE_MS : null;
  const msRemaining = deadline ? Math.max(0, deadline - Date.now()) : null;
  return {
    deploymentId,
    paid: Boolean(paidOrder),
    paymentStatus: dep?.paymentStatus || (paidOrder ? 'paid' : 'pending'),
    graceHours: Number(process.env.PAYMENT_GRACE_HOURS || 24),
    deployedAt: dep?.createdAt || null,
    deadlineAt: deadline ? new Date(deadline).toISOString() : null,
    hoursRemaining: msRemaining != null ? Math.ceil(msRemaining / (1000 * 3600)) : null,
    minutesRemaining: msRemaining != null ? Math.ceil(msRemaining / 60000) : null,
    overdue: deployedAt ? Date.now() > deployedAt + GRACE_MS : false,
    paidAt: paidOrder?.updatedAt || null,
    amounts: paidOrder?.amounts || null,
  };
}
