/**
 * Payments API client — deploy-first K100 billing (customer side).
 */
import { liveApiRequest } from '../api.js';
import { authHeaders } from './auth.js';

function liveApiUrl(path) {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}${path}` : `/api${path}`;
}

/** Fetch a single checkout order (owner only) with its receipts. */
export const getPaymentOrder = (orderId) => liveApiRequest(`/payments/orders/${encodeURIComponent(orderId)}`);
// Backward-compatible alias.
export const getOrder = getPaymentOrder;

/**
 * Upload a manual bank-transfer receipt (PDF/PNG/JPG/JPEG) for an order.
 * Canonical form: uploadManualReceipt({ checkoutOrderId, file, note }).
 * Also accepts the legacy form uploadManualReceipt(file, { checkoutOrderId, note }).
 */
export async function uploadManualReceipt(arg, maybeOpts) {
  const isFileFirst = arg && typeof arg === 'object' && (typeof File !== 'undefined' ? arg instanceof File : arg.name && arg.size != null);
  const { checkoutOrderId, file, note } = isFileFirst
    ? { file: arg, ...(maybeOpts || {}) }
    : (arg || {});

  if (!file) throw new Error('Choose a receipt file first.');
  if (!checkoutOrderId) throw new Error('A checkout order is required.');

  const form = new FormData();
  form.append('receipt', file);
  form.append('checkoutOrderId', checkoutOrderId);
  if (note) form.append('note', note);

  let response;
  try {
    response = await fetch(liveApiUrl('/payments/manual-receipts'), {
      method: 'POST',
      headers: { ...authHeaders() },
      body: form,
    });
  } catch (networkError) {
    throw new Error(`Network error: ${networkError.message || 'Could not reach the server.'}`);
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = result?.error?.message || result?.message || `Receipt upload failed (${response.status}).`;
    throw new Error(msg);
  }
  return result?.data ?? result;
}

/** Start a PayPal (card via PayPal) payment for a deployment order. Returns { approvalUrl, paypalOrderId }. */
export const createDeploymentPaypalOrder = (checkoutOrderId) =>
  liveApiRequest('/payments/paypal/orders', { method: 'POST', body: { checkoutOrderId } });
// Backward-compatible alias.
export const createPaypalOrder = createDeploymentPaypalOrder;

/** Capture a PayPal order after approval; marks the order + deployment paid. */
export const captureDeploymentPaypalOrder = (paypalOrderId) =>
  liveApiRequest(`/payments/paypal/orders/${encodeURIComponent(paypalOrderId)}/capture`, { method: 'POST' });
// Backward-compatible alias.
export const capturePaypalOrder = captureDeploymentPaypalOrder;
