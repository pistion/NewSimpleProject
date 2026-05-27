import express from 'express';
import { newId, mutateStore, readStore, logAction } from '../services/vpsStore.js';
import * as vultr from '../services/vultrApiService.js';

const router = express.Router();

const PAYPAL_SANDBOX = String(process.env.PAYPAL_SANDBOX ?? 'true').toLowerCase() !== 'false';
const PAYPAL_BASE    = PAYPAL_SANDBOX ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
const FRONTEND_URL   = process.env.FRONTEND_URL || 'http://localhost:5173';
const MARKUP_PERCENT = Number(process.env.PLATFORM_MARKUP_PERCENT ?? 30);

let cachedPaypalToken = null;
let paypalTokenExpiry = 0;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractActor(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token === 'local-demo-token') {
    return { userId: 'local-user', organizationId: 'local-org' };
  }
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      return {
        userId:         payload.sub || payload.userId || 'local-user',
        organizationId: payload.organizationId || payload.org_id || 'local-org',
      };
    }
  } catch { /* fall through */ }
  return { userId: 'local-user', organizationId: 'local-org' };
}

function serializeVps(r) {
  return {
    id:                 r.id,
    organizationId:     r.organizationId,
    providerInstanceId: r.providerInstanceId,
    label:              r.label,
    hostname:           r.hostname,
    region:             r.region,
    plan:               r.plan,
    osId:               r.osId,
    osName:             r.osName ?? null,
    status:             r.status,
    mainIp:             r.mainIp ?? null,
    vcpuCount:          r.vcpuCount ?? null,
    ramMb:              r.ramMb ?? null,
    diskGb:             r.diskGb ?? null,
    monthlyCostCents:   r.monthlyCostCents,
    markupPercent:      r.markupPercent,
    markupAmountCents:  r.markupAmountCents,
    totalPriceCents:    r.totalPriceCents,
    currency:           r.currency || 'USD',
    paymentStatus:      r.paymentStatus,
    createdAt:          r.createdAt,
    updatedAt:          r.updatedAt,
  };
}

function requireOwned(store, id, organizationId) {
  const record = (store.services || []).find((s) => s.id === id && !s.deletedAt);
  if (!record) return { err: 404, msg: 'VPS service not found.' };
  if (record.organizationId !== organizationId) return { err: 403, msg: 'Access denied.' };
  return { record };
}

async function getPayPalToken() {
  if (cachedPaypalToken && Date.now() < paypalTokenExpiry) return cachedPaypalToken;
  const clientId     = process.env.PAYPAL_CLIENT_ID     || '';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) throw Object.assign(new Error('PayPal is not configured.'), { status: 400 });
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw Object.assign(new Error('Failed to authenticate with PayPal.'), { status: 400 });
  const data = await res.json();
  cachedPaypalToken = data.access_token;
  paypalTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedPaypalToken;
}

function calcPricing(planMonthlyCost) {
  const markup    = MARKUP_PERCENT;
  const baseCents = Math.round(planMonthlyCost * 100);
  const mkupCents = Math.round(baseCents * (markup / 100));
  return { baseCents, mkupCents, totalCents: baseCents + mkupCents, markup };
}

function wrap(fn) {
  return async (req, res, next) => {
    try { await fn(req, res, next); } catch (err) {
      res.status(err.status || 500).json({ error: { message: err.message } });
    }
  };
}

// ─── Catalog / settings ────────────────────────────────────────────────────────

router.get('/settings', (req, res) => {
  res.json({
    vultrConfigured:  vultr.isConfigured(),
    paypalConfigured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    markupPercent:    MARKUP_PERCENT,
    sandbox:          PAYPAL_SANDBOX,
  });
});

router.get('/regions', wrap(async (req, res) => {
  res.json(await vultr.listRegions());
}));

router.get('/plans', wrap(async (req, res) => {
  res.json(await vultr.listPlans(req.query.type));
}));

router.get('/os', wrap(async (req, res) => {
  res.json(await vultr.listOs());
}));

// ─── Quote ─────────────────────────────────────────────────────────────────────

router.post('/quote', wrap(async (req, res) => {
  const { region, plan: planId, osId } = req.body || {};
  const plans = await vultr.listPlans();
  const plan = plans.find((p) => p.id === planId);
  if (!plan) return res.status(404).json({ error: { message: `Plan "${planId}" not found.` } });
  const { baseCents, mkupCents, totalCents, markup } = calcPricing(plan.monthly_cost);
  res.json({
    plan:                   planId,
    region,
    osId,
    baseMonthlyCostCents:   baseCents,
    markupPercent:          markup,
    markupAmountCents:      mkupCents,
    totalMonthlyCostCents:  totalCents,
    currency:               'USD',
    breakdown: {
      vpsPrice:    `$${(baseCents  / 100).toFixed(2)}`,
      platformFee: `$${(mkupCents  / 100).toFixed(2)}`,
      total:       `$${(totalCents / 100).toFixed(2)}`,
    },
  });
}));

// ─── Direct deploy (usage-billed — no upfront payment) ────────────────────────
// Deploy immediately; billing accrues hourly and is collected at period end.

router.post('/services', wrap(async (req, res) => {
  const dto   = req.body || {};
  const actor = extractActor(req);

  if (!dto.plan || !dto.region || dto.osId == null || !dto.label) {
    return res.status(400).json({ error: { message: 'plan, region, osId and label are required.' } });
  }

  const plans = await vultr.listPlans();
  const plan  = plans.find((p) => p.id === dto.plan);
  if (!plan) return res.status(404).json({ error: { message: `Plan "${dto.plan}" not found.` } });

  const { baseCents, mkupCents, totalCents, markup } = calcPricing(plan.monthly_cost);

  // Resolve OS name for display
  let osName = null;
  try {
    const osList = await vultr.listOs();
    const osEntry = osList.find((o) => o.id === dto.osId);
    osName = osEntry?.name ?? null;
  } catch { /* non-critical */ }

  // Register SSH key if a public key was pasted
  let resolvedSshKeyId = dto.sshKeyId || undefined;
  if (dto.sshPublicKey) {
    try {
      const keyName = dto.sshKeyName || `glondia-${dto.label}`;
      const newKey  = await vultr.createSshKey(keyName, dto.sshPublicKey);
      resolvedSshKeyId = newKey.id;
    } catch (e) {
      console.warn('[vps] SSH key creation failed, continuing without it:', e.message);
    }
  }

  // Provision the Vultr instance immediately
  const now = new Date().toISOString();
  let instance;
  try {
    instance = await vultr.createInstance({
      region:   dto.region,
      plan:     dto.plan,
      os_id:    dto.osId,
      label:    dto.label,
      hostname: dto.hostname ?? dto.label,
      ...(resolvedSshKeyId   ? { sshkey_id: [resolvedSshKeyId] } : {}),
      ...(dto.userData        ? { user_data: Buffer.from(dto.userData).toString('base64') } : {}),
      ...(dto.enableIpv6      ? { enable_ipv6: true } : {}),
      ...(dto.backups         ? { backups: 'enabled' } : {}),
      ...(dto.ddosProtection  ? { ddos_protection: true } : {}),
      tags: [`org:${actor.organizationId}`],
    });
  } catch (err) {
    console.error('[vps] Vultr createInstance failed:', err.message);
    return res.status(502).json({ error: { message: `Server provisioning failed: ${err.message}` } });
  }

  // Persist the VPS record in the file store
  const record = {
    id:                 newId(),
    organizationId:     actor.organizationId,
    createdByUserId:    actor.userId,
    providerInstanceId: instance.id,
    label:              dto.label,
    hostname:           dto.hostname ?? dto.label,
    region:             dto.region,
    plan:               dto.plan,
    osId:               dto.osId,
    osName,
    status:             instance.status ?? 'pending',
    mainIp:             instance.main_ip ?? null,
    vcpuCount:          instance.vcpu_count ?? null,
    ramMb:              instance.ram ?? null,
    diskGb:             instance.disk ?? null,
    monthlyCostCents:   baseCents,
    markupPercent:      markup,
    markupAmountCents:  mkupCents,
    totalPriceCents:    totalCents,
    currency:           'USD',
    paymentStatus:      'active',
    metadata:           JSON.stringify({ billingModel: 'usage', vultrId: instance.id }),
    createdAt:          now,
    updatedAt:          now,
  };

  await mutateStore((s) => {
    s.services.push(record);
    logAction(s, record.id, actor.organizationId, actor.userId, 'create', 'success', dto);
  });

  console.log(`[vps] Deployed ${record.id} — Vultr instance ${instance.id} in ${dto.region}`);
  res.status(201).json(serializeVps(record));
}));

// ─── PayPal — create order ──────────────────────────────────────────────────────

router.post('/paypal/create-order', wrap(async (req, res) => {
  const dto    = req.body || {};
  const actor  = extractActor(req);
  const plans  = await vultr.listPlans();
  const plan   = plans.find((p) => p.id === dto.plan);
  if (!plan) return res.status(404).json({ error: { message: `Plan "${dto.plan}" not found.` } });
  const { baseCents, mkupCents, totalCents, markup } = calcPricing(plan.monthly_cost);
  const totalAmount = (totalCents / 100).toFixed(2);
  const token = await getPayPalToken();

  const orderBody = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: `vps-${actor.organizationId}-${Date.now()}`,
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
      return_url: `${FRONTEND_URL}/dashboard/hosting?vps=success`,
      cancel_url: `${FRONTEND_URL}/dashboard/hosting?vps=cancelled`,
    },
  };

  const ppRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(orderBody),
  });
  if (!ppRes.ok) {
    const e = await ppRes.text();
    console.error('[vps] PayPal createOrder failed:', e);
    return res.status(400).json({ error: { message: 'Failed to create PayPal order. Please try again.' } });
  }
  const order = await ppRes.json();
  const approvalUrl = order.links?.find((l) => l.rel === 'approve')?.href;
  res.status(201).json({
    orderId: order.id, approvalUrl,
    quote: { baseMonthlyCostCents: baseCents, markupPercent: markup, markupAmountCents: mkupCents, totalMonthlyCostCents: totalCents, currency: 'USD' },
    provisionDetails: dto,
  });
}));

// ─── PayPal — capture + provision ──────────────────────────────────────────────

router.post('/paypal/capture', wrap(async (req, res) => {
  const { orderId, provisionDetails: dto } = req.body || {};
  const actor = extractActor(req);

  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return res.status(400).json({ error: { message: 'PayPal is not configured.' } });
  }

  // Idempotency — return existing VPS if this order was already captured
  const store = await readStore();
  const existing = (store.services || []).find(
    (s) => s.organizationId === actor.organizationId && s.paypalOrderId === orderId && !s.deletedAt,
  );
  if (existing) return res.json(serializeVps(existing));

  // Capture the PayPal payment
  const token = await getPayPalToken();
  const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!captureRes.ok) {
    const e = await captureRes.text();
    console.error('[vps] PayPal capture failed:', e);
    return res.status(400).json({ error: { message: 'PayPal payment capture failed. Please try again.' } });
  }
  const capture = await captureRes.json();
  const captureRecord = capture.purchase_units?.[0]?.payments?.captures?.[0];
  if (!captureRecord || captureRecord.status !== 'COMPLETED') {
    return res.status(400).json({ error: { message: `Payment not completed. Status: ${captureRecord?.status ?? 'unknown'}` } });
  }

  // Resolve pricing
  const plans = await vultr.listPlans();
  const plan = plans.find((p) => p.id === dto.plan);
  if (!plan) return res.status(404).json({ error: { message: `Plan "${dto.plan}" not found.` } });
  const { baseCents, mkupCents, totalCents, markup } = calcPricing(plan.monthly_cost);

  // Resolve OS name for display
  let osName = null;
  try {
    const osList = await vultr.listOs();
    const osEntry = osList.find((o) => o.id === dto.osId);
    osName = osEntry?.name ?? null;
  } catch { /* non-critical */ }

  // Register SSH key if provided
  let resolvedSshKeyId = dto.sshKeyId;
  if (dto.sshPublicKey) {
    try {
      const keyName = dto.sshKeyName || `glondia-${dto.label}`;
      const newKey = await vultr.createSshKey(keyName, dto.sshPublicKey);
      resolvedSshKeyId = newKey.id;
    } catch (e) {
      console.warn('[vps] SSH key creation failed, continuing:', e.message);
    }
  }

  // Create the Vultr instance
  let instance;
  const now = new Date().toISOString();
  try {
    instance = await vultr.createInstance({
      region:   dto.region,
      plan:     dto.plan,
      os_id:    dto.osId,
      label:    dto.label,
      hostname: dto.hostname ?? dto.label,
      ...(resolvedSshKeyId ? { sshkey_id: [resolvedSshKeyId] } : {}),
      ...(dto.userData       ? { user_data: Buffer.from(dto.userData).toString('base64') } : {}),
      ...(dto.enableIpv6     ? { enable_ipv6: true } : {}),
      ...(dto.backups        ? { backups: 'enabled' } : {}),
      ...(dto.ddosProtection ? { ddos_protection: true } : {}),
      tags: [`org:${actor.organizationId}`],
    });
  } catch (err) {
    // Payment captured but provisioning failed — store error record
    const failId = newId();
    await mutateStore((s) => {
      s.services.push({
        id: failId, organizationId: actor.organizationId, createdByUserId: actor.userId,
        providerInstanceId: 'FAILED', label: dto.label, hostname: dto.hostname ?? dto.label,
        region: dto.region, plan: dto.plan, osId: dto.osId, osName,
        status: 'error', mainIp: null, vcpuCount: null, ramMb: null, diskGb: null,
        monthlyCostCents: baseCents, markupPercent: markup, markupAmountCents: mkupCents,
        totalPriceCents: totalCents, currency: 'USD',
        paypalOrderId: orderId, paypalCaptureId: captureRecord.id, paymentStatus: 'completed',
        metadata: JSON.stringify({ error: err.message }),
        createdAt: now, updatedAt: now,
      });
    });
    console.error('[vps] Vultr createInstance failed after PayPal capture:', err.message);
    return res.status(409).json({
      error: { message: `Payment was captured but server provisioning failed. Contact support@glondia.co with order ID: ${orderId}` },
    });
  }

  // Persist the VPS record
  const record = {
    id: newId(), organizationId: actor.organizationId, createdByUserId: actor.userId,
    providerInstanceId: instance.id, label: dto.label, hostname: dto.hostname ?? dto.label,
    region: dto.region, plan: dto.plan, osId: dto.osId, osName,
    status: instance.status ?? 'pending',
    mainIp: instance.main_ip ?? null, vcpuCount: instance.vcpu_count ?? null,
    ramMb: instance.ram ?? null, diskGb: instance.disk ?? null,
    monthlyCostCents: baseCents, markupPercent: markup, markupAmountCents: mkupCents,
    totalPriceCents: totalCents, currency: 'USD',
    paypalOrderId: orderId, paypalCaptureId: captureRecord.id, paymentStatus: 'completed',
    metadata: JSON.stringify({ vultrId: instance.id }),
    createdAt: now, updatedAt: now,
  };

  await mutateStore((s) => {
    s.services.push(record);
    logAction(s, record.id, actor.organizationId, actor.userId, 'create', 'success', dto);
  });

  res.status(201).json(serializeVps(record));
}));

// ─── Service management ────────────────────────────────────────────────────────

router.get('/services', wrap(async (req, res) => {
  const { organizationId } = extractActor(req);
  const store = await readStore();
  const services = (store.services || [])
    .filter((s) => s.organizationId === organizationId && !s.deletedAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(serializeVps);
  res.json(services);
}));

router.get('/services/:id', wrap(async (req, res) => {
  const { organizationId } = extractActor(req);
  const store = await readStore();
  const { record, err, msg } = requireOwned(store, req.params.id, organizationId);
  if (err) return res.status(err).json({ error: { message: msg } });

  // Refresh status from Vultr if possible
  if (record.providerInstanceId !== 'FAILED') {
    try {
      const live = await vultr.getInstance(record.providerInstanceId);
      if (live.status !== record.status || live.main_ip !== record.mainIp) {
        await mutateStore((s) => {
          const r = s.services.find((x) => x.id === record.id);
          if (r) { r.status = live.status; r.mainIp = live.main_ip; r.updatedAt = new Date().toISOString(); }
        });
        return res.json(serializeVps({ ...record, status: live.status, mainIp: live.main_ip }));
      }
    } catch { /* Vultr unreachable — return cached */ }
  }
  res.json(serializeVps(record));
}));

router.post('/services/:id/start', wrap(async (req, res) => {
  const actor = extractActor(req);
  const store = await readStore();
  const { record, err, msg } = requireOwned(store, req.params.id, actor.organizationId);
  if (err) return res.status(err).json({ error: { message: msg } });
  await vultr.startInstance(record.providerInstanceId);
  await mutateStore((s) => logAction(s, record.id, actor.organizationId, actor.userId, 'start', 'success', {}));
  res.json({ ok: true });
}));

router.post('/services/:id/halt', wrap(async (req, res) => {
  const actor = extractActor(req);
  const store = await readStore();
  const { record, err, msg } = requireOwned(store, req.params.id, actor.organizationId);
  if (err) return res.status(err).json({ error: { message: msg } });
  await vultr.haltInstance(record.providerInstanceId);
  await mutateStore((s) => logAction(s, record.id, actor.organizationId, actor.userId, 'halt', 'success', {}));
  res.json({ ok: true });
}));

router.post('/services/:id/reboot', wrap(async (req, res) => {
  const actor = extractActor(req);
  const store = await readStore();
  const { record, err, msg } = requireOwned(store, req.params.id, actor.organizationId);
  if (err) return res.status(err).json({ error: { message: msg } });
  await vultr.rebootInstance(record.providerInstanceId);
  await mutateStore((s) => logAction(s, record.id, actor.organizationId, actor.userId, 'reboot', 'success', {}));
  res.json({ ok: true });
}));

router.delete('/services/:id', wrap(async (req, res) => {
  const actor = extractActor(req);
  const store = await readStore();
  const { record, err, msg } = requireOwned(store, req.params.id, actor.organizationId);
  if (err) return res.status(err).json({ error: { message: msg } });

  // Delete from Vultr first; if DB update fails, mark error rather than leaving stale
  await vultr.deleteInstance(record.providerInstanceId);

  try {
    await mutateStore((s) => {
      const r = s.services.find((x) => x.id === record.id);
      if (r) { r.deletedAt = new Date().toISOString(); r.status = 'destroyed'; r.updatedAt = new Date().toISOString(); }
      logAction(s, record.id, actor.organizationId, actor.userId, 'destroy', 'success', {});
    });
  } catch (dbErr) {
    // Vultr instance is gone — mark as error so the user isn't stuck
    await mutateStore((s) => {
      const r = s.services.find((x) => x.id === record.id);
      if (r) { r.status = 'error'; r.metadata = JSON.stringify({ destroyError: dbErr.message }); r.updatedAt = new Date().toISOString(); }
    });
    throw dbErr;
  }
  res.json({ ok: true });
}));

export default router;
