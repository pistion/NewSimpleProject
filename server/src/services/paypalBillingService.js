import { prisma } from './db.js';
import { calcPricing } from './vpsPricingService.js';
import * as vultr from './vultrApiService.js';

const SANDBOX     = String(process.env.PAYPAL_SANDBOX ?? 'true').toLowerCase() !== 'false';
const BASE        = SANDBOX ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
const FRONTEND    = process.env.FRONTEND_URL || 'http://localhost:5173';

let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const id  = process.env.PAYPAL_CLIENT_ID     || '';
  const sec = process.env.PAYPAL_CLIENT_SECRET || '';
  if (!id || !sec) throw Object.assign(new Error('PayPal is not configured.'), { status: 400 });
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${sec}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw Object.assign(new Error('Failed to authenticate with PayPal.'), { status: 400 });
  const data = await res.json();
  _token = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

/**
 * Creates a PayPal order and a CheckoutOrder DB record (status=pending).
 * Stores provisionDetails server-side so capture never trusts the client.
 */
export async function createOrder(organizationId, userId, dto) {
  const plans = await vultr.listPlans();
  const plan = plans.find((p) => p.id === dto.plan);
  if (!plan) throw Object.assign(new Error(`Plan "${dto.plan}" not found.`), { status: 404 });

  const { baseCents, mkupCents, totalCents, markup } = calcPricing(plan.monthly_cost);
  const totalAmount = (totalCents / 100).toFixed(2);
  const token = await getToken();

  const ppRes = await fetch(`${BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: `vps-${organizationId}-${Date.now()}`,
        description:  `Glondia VPS – ${dto.label} (${dto.region} / ${dto.plan})`,
        amount: {
          currency_code: 'USD', value: totalAmount,
          breakdown: { item_total: { currency_code: 'USD', value: totalAmount } },
        },
        items: [{
          name: `VPS Server — ${dto.label}`,
          description: `Region: ${dto.region} | Plan: ${dto.plan}`,
          quantity: '1',
          unit_amount: { currency_code: 'USD', value: totalAmount },
          category: 'DIGITAL_GOODS',
        }],
      }],
      application_context: {
        brand_name: 'Glondia', locale: 'en-US',
        shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW',
        return_url: `${FRONTEND}/dashboard/hosting?vps=success`,
        cancel_url: `${FRONTEND}/dashboard/hosting?vps=cancelled`,
      },
    }),
  });

  if (!ppRes.ok) {
    const body = await ppRes.text();
    console.error('[paypal] createOrder failed:', body);
    throw Object.assign(new Error('Failed to create PayPal order. Please try again.'), { status: 400 });
  }

  const order = await ppRes.json();
  const approvalUrl = order.links?.find((l) => l.rel === 'approve')?.href;

  // Store provision details and expected amount server-side
  const provisionDetails = {
    plan: dto.plan, region: dto.region, osId: dto.osId,
    label: dto.label, hostname: dto.hostname ?? dto.label,
    sshKeyId: dto.sshKeyId, sshPublicKey: dto.sshPublicKey, sshKeyName: dto.sshKeyName,
    userData: dto.userData, enableIpv6: dto.enableIpv6,
    backups: dto.backups, ddosProtection: dto.ddosProtection,
  };

  await prisma.checkoutOrder.create({
    data: {
      organizationId,
      userId:           userId === 'local-user' ? null : userId,
      type:             'vps',
      provider:         'paypal',
      providerOrderId:  order.id,
      status:           'pending',
      currency:         'USD',
      actualAmountCents: baseCents,
      markupPercent:    markup,
      markupAmountCents: mkupCents,
      totalAmountCents:  totalCents,
      metadata: JSON.stringify({ provisionDetails }),
    },
  });

  return {
    orderId: order.id,
    approvalUrl,
    // Customer-facing quote: price and currency only — cost and margin stay internal.
    quote: {
      totalMonthlyCostCents: totalCents,
      currency: 'USD',
    },
  };
}

/**
 * Captures a PayPal payment. Verifies amount and currency.
 * Returns { checkoutOrder, captureRecord, provisionDetails }.
 * Throws if the order doesn't belong to this org or capture fails.
 */
export async function captureOrder(organizationId, paypalOrderId) {
  // Load server-side order record — rejects cross-org capture
  const checkoutOrder = await prisma.checkoutOrder.findFirst({
    where: { providerOrderId: paypalOrderId, organizationId },
  });
  if (!checkoutOrder) {
    throw Object.assign(new Error('Order not found or does not belong to this account.'), { status: 404 });
  }

  // Idempotency: already captured
  if (checkoutOrder.status === 'paid') {
    const meta = JSON.parse(checkoutOrder.metadata || '{}');
    return { checkoutOrder, captureRecord: meta.paypalCapture, provisionDetails: meta.provisionDetails };
  }

  const token = await getToken();
  const captureRes = await fetch(`${BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (!captureRes.ok) {
    const body = await captureRes.text();
    console.error('[paypal] capture failed:', body);
    throw Object.assign(new Error('PayPal payment capture failed. Please try again.'), { status: 400 });
  }

  const capture = await captureRes.json();
  const captureRecord = capture.purchase_units?.[0]?.payments?.captures?.[0];

  if (!captureRecord || captureRecord.status !== 'COMPLETED') {
    throw Object.assign(
      new Error(`Payment not completed. Status: ${captureRecord?.status ?? 'unknown'}`),
      { status: 400 },
    );
  }

  // Verify currency and amount
  if (captureRecord.amount?.currency_code !== 'USD') {
    throw Object.assign(new Error('Unexpected payment currency.'), { status: 400 });
  }
  const capturedCents = Math.round(parseFloat(captureRecord.amount.value) * 100);
  if (capturedCents !== checkoutOrder.totalAmountCents) {
    console.error(`[paypal] amount mismatch: expected ${checkoutOrder.totalAmountCents}, got ${capturedCents}`);
    throw Object.assign(new Error('Payment amount mismatch. Contact support.'), { status: 400 });
  }

  const meta = JSON.parse(checkoutOrder.metadata || '{}');
  const updatedMeta = { ...meta, paypalCapture: captureRecord };

  const updated = await prisma.checkoutOrder.update({
    where: { id: checkoutOrder.id },
    data: {
      status:            'paid',
      providerCaptureId: captureRecord.id,
      metadata:          JSON.stringify(updatedMeta),
    },
  });

  return { checkoutOrder: updated, captureRecord, provisionDetails: meta.provisionDetails };
}

/**
 * Update a checkout order's lifecycle status (e.g. provision_failed, db_error).
 * Owned by the billing service so feature services never touch the orders
 * table directly. Never throws — order-state bookkeeping must not mask the
 * originating failure.
 */
export async function updateOrderStatus(checkoutOrderId, status) {
  try {
    return await prisma.checkoutOrder.update({ where: { id: checkoutOrderId }, data: { status } });
  } catch (err) {
    console.error(`[paypal] Failed to set order ${checkoutOrderId} → ${status}:`, err.message);
    return null;
  }
}
