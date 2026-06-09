import * as vultr from '../services/vultrApiService.js';
import * as pricing from '../services/vpsPricingService.js';
import * as paypal from '../services/paypalBillingService.js';
import * as svc from '../services/vpsHostingService.js';

/**
 * Extract userId + organizationId from the request's JWT.
 * Kept in the controller layer because it reads from req.headers — services
 * must never receive HTTP req/res objects.
 */
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

function wrap(fn) {
  return async (req, res, next) => {
    try { await fn(req, res, next); } catch (err) {
      res.status(err.status || 500).json({ error: { message: err.message } });
    }
  };
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const getSettings = (req, res) => res.json(svc.getSettings());

export const listRegions = wrap(async (req, res) =>
  res.json(await vultr.listRegions()));

export const listPlans = wrap(async (req, res) =>
  res.json(await vultr.listPlans(req.query.type)));

export const listOs = wrap(async (req, res) =>
  res.json(await vultr.listOs()));

export const quote = wrap(async (req, res) => {
  const { region, plan, osId } = req.body || {};
  res.json(await pricing.getQuote(plan, region, osId));
});

// ─── Direct deploy ────────────────────────────────────────────────────────────

export const createService = wrap(async (req, res) => {
  const actor = extractActor(req);
  const record = await svc.createDirect(req.body || {}, actor);
  res.status(201).json(record);
});

// ─── PayPal ───────────────────────────────────────────────────────────────────

export const createPaypalOrder = wrap(async (req, res) => {
  const { userId, organizationId } = extractActor(req);
  const result = await paypal.createOrder(organizationId, userId, req.body || {});
  res.status(201).json(result);
});

export const capturePaypalOrder = wrap(async (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: { message: 'orderId is required.' } });
  const actor = extractActor(req);
  const record = await svc.captureAndProvision(orderId, actor);
  res.status(201).json(record);
});

// ─── Service management ───────────────────────────────────────────────────────

export const listServices = wrap(async (req, res) => {
  const { organizationId } = extractActor(req);
  res.json(await svc.listServices(organizationId));
});

export const getService = wrap(async (req, res) => {
  const { organizationId } = extractActor(req);
  res.json(await svc.getService(req.params.id, organizationId));
});

export const startService = wrap(async (req, res) => {
  await svc.startService(req.params.id, extractActor(req));
  res.json({ ok: true });
});

export const haltService = wrap(async (req, res) => {
  await svc.haltService(req.params.id, extractActor(req));
  res.json({ ok: true });
});

export const rebootService = wrap(async (req, res) => {
  await svc.rebootService(req.params.id, extractActor(req));
  res.json({ ok: true });
});

export const destroyService = wrap(async (req, res) => {
  await svc.destroyService(req.params.id, extractActor(req));
  res.json({ ok: true });
});

// ─── SSH keys ─────────────────────────────────────────────────────────────────

export const listSshKeys = wrap(async (req, res) => {
  const { organizationId } = extractActor(req);
  res.json(await svc.listSshKeys(organizationId));
});

export const deleteSshKey = wrap(async (req, res) => {
  await svc.deleteSshKey(req.params.keyId);
  res.json({ ok: true });
});

// ─── Bandwidth ────────────────────────────────────────────────────────────────

export const getBandwidth = wrap(async (req, res) => {
  const { organizationId } = extractActor(req);
  res.json(await svc.getBandwidth(req.params.id, organizationId));
});

// ─── Snapshots ────────────────────────────────────────────────────────────────

export const listSnapshots = wrap(async (req, res) =>
  res.json(await svc.listSnapshots()));

export const createSnapshot = wrap(async (req, res) => {
  const { organizationId } = extractActor(req);
  res.status(201).json(await svc.createSnapshot(req.params.id, organizationId, req.body?.description));
});

export const deleteSnapshot = wrap(async (req, res) => {
  await svc.deleteSnapshot(req.params.snapshotId);
  res.json({ ok: true });
});

export const restoreService = wrap(async (req, res) => {
  const { organizationId } = extractActor(req);
  await svc.restoreService(req.params.id, organizationId, req.body?.snapshotId);
  res.json({ ok: true });
});

// ─── Backup schedule ──────────────────────────────────────────────────────────

export const getBackupSchedule = wrap(async (req, res) => {
  const { organizationId } = extractActor(req);
  res.json(await svc.getBackupSchedule(req.params.id, organizationId));
});

export const setBackupSchedule = wrap(async (req, res) => {
  const { organizationId } = extractActor(req);
  res.json(await svc.setBackupSchedule(req.params.id, organizationId, req.body));
});

// ─── Resize / reinstall ───────────────────────────────────────────────────────

export const resizeService = wrap(async (req, res) => {
  await svc.resizeService(req.params.id, extractActor(req), req.body?.plan);
  res.json({ ok: true });
});

export const reinstallService = wrap(async (req, res) => {
  await svc.reinstallService(req.params.id, extractActor(req), req.body);
  res.json({ ok: true });
});
