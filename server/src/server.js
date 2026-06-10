import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { requestId } from './middleware/request-id.middleware.js';
import { responseHelper } from './middleware/response.middleware.js';
import { requireFeature, featureFlagsHandler } from './middleware/featureFlag.js';

import frontPageRoutes from './routes/frontPage.routes.js';
import publicRoutes from './routes/public.routes.js';
import authRoutes from './routes/auth.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';
import workspaceDetailRoutes from './routes/workspace-detail.routes.js';
import projectRoutes from './routes/project.routes.js';
import domainPublicRoutes from './routes/domain-public.routes.js';
import domainRoutes from './routes/domain.routes.js';
import siteRoutes from './routes/site.routes.js';
import publicSalesRoutes from './routes/public-sales.routes.js';
import commerceRoutes from './routes/commerce.routes.js';
import templateRoutes from './routes/template.routes.js';
import templateAiRoutes from './routes/template-ai.routes.js';
import eventsRoutes from './routes/events.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import billingRoutes from './routes/billing.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import eventStreamRoutes from './routes/event-stream.routes.js';
import deploymentRoutes from './routes/deploymentRoutes.js';
import hostingRoutes from './routes/hostingRoutes.js';
import environmentRoutes from './routes/environmentRoutes.js';
import domainHostingRoutes from './routes/domainRoutes.js';
import diskRoutes from './routes/diskRoutes.js';
import vpsHostingRoutes from './routes/vpsHostingRoutes.js';
import paymentsRoutes from './routes/payments.routes.js';
import adminRoutes from './routes/admin.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import providerRenderRoutes from './glondia-engines/01-HOSTING-DEPLOY-ENGINE/01-ROUTES/providerRender.routes.js';
import sandboxRoutes from './glondia-engines/01-HOSTING-DEPLOY-ENGINE/01-ROUTES/sandbox.routes.js';
import spaceshipRoutes from './routes/provider-spaceship.routes.js';
import { checkSpaceshipAvailability, registerSpaceshipDomain, saveSpaceshipContact, cleanDomainName } from './services/providerSpaceship.service.js';
import { providerApiGuard } from './glondia-engines/01-HOSTING-DEPLOY-ENGINE/services/providerApiGuard.service.js';
import { verifyPaypalWebhook, handlePaypalWebhookEvent } from './services/paypalWebhookService.js';
import { startDeploymentCleanupJob } from './services/deploymentCleanupService.js';
import { warmForexCache } from './services/forexService.js';
import { prisma, ensureUserColumns, ensureNotificationsTable, ensureDeploymentSubscriptionsTable } from './services/db.js';
import { auditWrites } from './middleware/audit.middleware.js';
import deploymentService from './services/deploymentService.js';
import deploymentStatusService from './services/deploymentStatusService.js';
import renderApiService from './services/renderApiService.js';
import { makeId, mutateHostingStore, nowIso, readHostingStore } from './services/hostingStore.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const isProd = process.env.NODE_ENV === 'production';
// Render injects PORT automatically. Local dev defaults to 3001 (matches vite proxy).
const PORT = Number(process.env.PORT || (isProd ? 10000 : 3001));

// ── Static file serving ─────────────────────────────────────────────────────
const rootDir = resolve(process.cwd());
const distDir = join(rootDir, 'dist');
const dataDir = resolveDataDir();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

function serveStatic(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const safePath = decodedPath.replace(/^\/+/, '');
  let filePath = resolve(distDir, safePath);

  if (!filePath.startsWith(distDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, 'index.html');
  }

  const ext = extname(filePath);
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(filePath).pipe(res);
}

function resolveDataDir() {
  const configured = process.env.DATA_DIR;
  const fallback = join(rootDir, '.glondia-data');
  if (!configured) return ensureDataDir(fallback);
  if (process.platform === 'win32' && configured.startsWith('/var/')) {
    return ensureDataDir(fallback);
  }

  const configuredDir = resolve(configured);
  try {
    return ensureDataDir(configuredDir);
  } catch (error) {
    console.warn(`[startup] DATA_DIR "${configuredDir}" is not writable (${error.code || error.message}); using "${fallback}" instead.`);
    return ensureDataDir(fallback);
  }
}

function ensureDataDir(dir) {
  mkdirSync(join(dir, 'sandboxes'), { recursive: true });
  return dir;
}

// ── Global middleware ────────────────────────────────────────────────────────
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : (isProd ? false : true); // allow all in dev, same-origin only in production

app.use(cors({ origin: corsOrigins, credentials: true }));

// ── PayPal webhook ───────────────────────────────────────────────────────────
// MUST be registered before express.json(): PayPal signature verification needs
// the exact raw request body. Configured webhook URL:
//   POST /api/v1/payments/paypal/webhook
app.post('/api/v1/payments/paypal/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  try {
    const verification = await verifyPaypalWebhook({ headers: req.headers, rawBody: req.body });
    if (!verification.ok) {
      console.error('[paypal:webhook] verification failed:', verification.reason || verification.status);
      // 400 → PayPal will retry; we do NOT act on unverified events.
      return res.status(400).json({ received: true, verified: false });
    }
    const result = await handlePaypalWebhookEvent(verification.event);
    console.log('[paypal:webhook]', verification.event?.event_type, JSON.stringify(result));
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[paypal:webhook] error:', err.message);
    // 500 → PayPal retries with backoff (covers transient DB/network errors).
    return res.status(500).json({ received: false });
  }
});

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(requestId);
app.use(responseHelper);
app.use(auditWrites);

// ── Health check (must come before API and static routes) ───────────────────
app.get('/healthz', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.type('text/plain').send('ok');
  } catch (err) {
    console.error('[healthz] DB check failed:', err.message);
    res.status(503).type('text/plain').send(`db_error: ${err.message}`);
  }
});

// ── Landing page — static assets + root HTML ─────────────────────────────────
const landingDir = join(rootDir, 'landing');
if (existsSync(landingDir)) {
  app.use(express.static(landingDir, {
    index: false,
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control', filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=3600');
    },
  }));
}
app.use('/', frontPageRoutes);

// Public feature-flag snapshot — drives the frontend Coming Soon gating.
app.get('/api/v1/features', featureFlagsHandler);

// Domain registrar + domain-payment provider surfaces are not part of the MVP.
app.use('/api/payments/domain', requireFeature('DOMAINS'));

// Provider routes: Render deploy/settings/import-github + Spaceship domain registrar
app.use('/api', providerRenderRoutes);
app.use('/api/spaceship', requireFeature('DOMAINS'), spaceshipRoutes);

app.get('/api/payments/paypal-client', (req, res) => {
  res.json({
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    configured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    sandbox: String(process.env.PAYPAL_SANDBOX || 'true').toLowerCase() !== 'false',
    markupPercent: getPlatformMarkupPercent(),
  });
});

app.post('/api/payments/domain/create-order', providerApiGuard, async (req, res, next) => {
  try {
    res.json(await createDomainPaymentOrder(req.body || {}, req.user || {}));
  } catch (error) {
    next(error);
  }
});

app.post('/api/payments/domain/capture', providerApiGuard, async (req, res, next) => {
  try {
    res.json(await captureDomainPaymentOrder(req.body || {}, req.user || {}));
  } catch (error) {
    next(error);
  }
});

app.post('/api/payments/hosting/create-order', providerApiGuard, async (req, res, next) => {
  try {
    res.json(await createHostingPaymentOrder(req.body || {}, req.user || {}));
  } catch (error) {
    next(error);
  }
});

app.post('/api/payments/hosting/capture', providerApiGuard, async (req, res, next) => {
  try {
    res.json(await captureHostingPaymentOrder(req.body || {}, req.user || {}));
  } catch (error) {
    next(error);
  }
});

// Payment status for an existing deployment — no auth required (billing tab reads this)
app.get('/api/payments/hosting/status/:deploymentId', async (req, res, next) => {
  try {
    const { deploymentId } = req.params;
    const GRACE_MS = Number(process.env.PAYMENT_GRACE_HOURS || 24) * 60 * 60 * 1000;
    const store = await readHostingStore();
    const dep = (store.deployments || []).find((d) => d.deploymentId === deploymentId || d.id === deploymentId);
    const paidOrder = (store.checkoutOrders || []).find(
      (o) => o.type === 'hosting_deployment' && o.status === 'paid' && o.metadata?.deploymentId === deploymentId
    );
    const deployedAt = dep?.createdAt ? new Date(dep.createdAt).getTime() : null;
    const deadline = deployedAt ? deployedAt + GRACE_MS : null;
    const msRemaining = deadline ? Math.max(0, deadline - Date.now()) : null;
    res.json({
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
    });
  } catch (err) {
    next(err);
  }
});

// ── Live deploy log stream (SSE) ─────────────────────────────────────────────
// Client connects via EventSource. We immediately flush stored Glondia events,
// then poll Render + our DB every 3 s for new log lines and status changes.
app.get('/api/deployments/:deploymentId/logs/stream', async (req, res) => {
  const { deploymentId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering on Render
  res.flushHeaders();

  const TERMINAL = new Set(['live', 'failed', 'deleted', 'suspended', 'deployed_unverified']);
  const POLL_MS = 3000;
  let cursor = null;
  let timer = null;
  let finished = false;

  const emit = (event, payload) => {
    if (finished) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  const finish = (reason = 'done') => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    emit('done', { reason });
    res.end();
  };

  req.on('close', () => { finished = true; clearInterval(timer); });

  try {
    const store = await readHostingStore();
    const dep = (store.deployments || []).find((d) => d.deploymentId === deploymentId || d.id === deploymentId);

    if (!dep) {
      emit('error', { message: 'Deployment not found.' });
      return res.end();
    }

    // Flush existing Glondia internal events (reverse so oldest is first)
    const stored = (store.logs[deploymentId] || []).slice().reverse();
    for (const log of stored) {
      emit('log', { id: log.id, message: log.message, level: log.level || 'info', timestamp: log.timestamp || log.createdAt, source: 'glondia' });
    }

    // Emit current status
    emit('status', { status: dep.status, buildStatus: dep.buildStatus, currentStep: dep.currentStep, liveUrl: dep.liveUrl, errorMessage: dep.errorMessage });

    if (TERMINAL.has(dep.status)) return finish('terminal');

    const poll = async () => {
      if (finished) return;
      try {
        // Refresh deployment status from Render API and sync into the store
        // This is the live sync point — keeps our store in sync with Render
        const s = await readHostingStore();
        let fresh = (s.deployments || []).find((d) => d.deploymentId === deploymentId || d.id === deploymentId);
        if (!fresh) return finish('not_found');

        // Only call Render to refresh if the deployment is in an active state
        const activeStates = new Set(['preparing', 'queued', 'building', 'deploying', 'deployed', 'deployed_unverified', 'prepared']);
        if (activeStates.has(fresh.status) && fresh.renderServiceId && !String(fresh.renderServiceId).includes('_pending')) {
          try {
            fresh = await deploymentStatusService.refreshDeployment(fresh) || fresh;
          } catch { /* continue with stored status if refresh fails */ }
        }

        emit('status', { status: fresh.status, buildStatus: fresh.buildStatus, currentStep: fresh.currentStep, liveUrl: fresh.liveUrl, errorMessage: fresh.errorMessage });

        // Fetch any new Glondia log entries since last poll
        const freshLogs = (s.logs[deploymentId] || []).slice().reverse();
        const seenGlondiaCount = stored.length;
        const newGlondia = freshLogs.slice(seenGlondiaCount);
        for (const log of newGlondia) {
          emit('log', { id: log.id, message: log.message, level: log.level || 'info', timestamp: log.timestamp || log.createdAt, source: 'glondia' });
          stored.push(log);
        }

        // Fetch Render deploy logs if we have real (non-pending) IDs
        if (fresh.renderServiceId && fresh.renderDeployId
            && !String(fresh.renderServiceId).includes('_pending')
            && !String(fresh.renderDeployId).includes('_pending')) {
          try {
            const resp = await renderApiService.getDeployLogs(fresh.renderServiceId, fresh.renderDeployId, cursor);
            const lines = Array.isArray(resp) ? resp : (resp?.logs || resp?.data || []);
            for (const line of lines) {
              const msg = line.message || line.msg || line.text || String(line);
              const level = (line.type === 'error' || line.level === 'error') ? 'error' : (line.type === 'warning' || line.level === 'warn') ? 'warn' : 'info';
              emit('log', { id: line.id, message: msg, level, timestamp: line.timestamp || line.createdAt, source: 'render' });
            }
            if (lines.length > 0 && lines[lines.length - 1].id) cursor = lines[lines.length - 1].id;
          } catch {
            // Render log API unavailable — continue polling status only
          }
        }

        if (TERMINAL.has(fresh.status)) finish('terminal');
      } catch (err) {
        emit('error', { message: err.message || 'Poll failed.' });
      }
    };

    await poll();
    timer = setInterval(poll, POLL_MS);
    // Hard timeout after 35 minutes so we don't leak connections
    setTimeout(() => finish('timeout'), 35 * 60 * 1000);
  } catch (err) {
    emit('error', { message: err.message || 'Stream initialisation failed.' });
    res.end();
  }
});

// Sandbox preview routes (must come before SPA fallback)
app.use('/sandbox', sandboxRoutes);

// ── API routes ───────────────────────────────────────────────────────────────

// Public (unauthenticated)
app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/public/sites', publicSalesRoutes);
app.use('/api/v1/domains', requireFeature('DOMAINS'), domainPublicRoutes);
app.use('/api/v1/templates', requireFeature('TEMPLATE_MARKETPLACE'), templateRoutes);
app.use('/api/template-ai', templateAiRoutes);
app.use('/api/v1/events', eventsRoutes);

// Auth
app.use('/api/v1/auth', authRoutes);

// Workspace (authenticated)
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/workspaces/:workspaceId', workspaceDetailRoutes);
app.use('/api/v1/workspaces/:workspaceId/projects', projectRoutes);
app.use('/api/v1/workspaces/:workspaceId/domains', requireFeature('DOMAINS'), domainRoutes);
app.use('/api/v1/workspaces/:workspaceId/sites', siteRoutes);
app.use('/api/v1/workspaces/:workspaceId/commerce', commerceRoutes);
app.use('/api/v1/workspaces/:workspaceId/analytics', requireFeature('ANALYTICS'), analyticsRoutes);
app.use('/api/v1/workspaces/:workspaceId/billing', billingRoutes);
app.use('/api/v1/workspaces/:workspaceId/settings', requireFeature('SETTINGS'), settingsRoutes);
app.use('/api/v1/workspaces/:workspaceId/events', eventStreamRoutes);

// VPS hosting — Vultr-backed cloud servers (not part of the MVP).
app.use('/api/v1/vps-hosting', requireFeature('VPS'), vpsHostingRoutes);

// Render-powered customer hosting surface used by the site builder and hosting dashboard.
app.use('/api/deployments', deploymentRoutes);
app.use('/api/hosting', hostingRoutes);
app.use('/api/hosting', environmentRoutes);
app.use('/api/hosting', diskRoutes);
app.use('/api/hosting', requireFeature('DOMAINS'), domainHostingRoutes);

// Deploy-first tiered billing: customer payments + receipts, and the admin surface.
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);
// User-facing notifications (Bell dropdown) — mounted on both API prefixes.
app.use('/api/notifications', notificationRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// ── SPA fallback — serve Vite dist for everything else ──────────────────────
app.use((req, res) => serveStatic(req, res));

const FALLBACK_TLD_PRICE_CENTS = new Map([
  ['.com', 1499], ['.com.pg', 4999], ['.com.fj', 5999], ['.com.vu', 4499],
  ['.co', 2499], ['.io', 3999], ['.app', 1699], ['.dev', 1499],
  ['.org', 1249], ['.net', 1199], ['.store', 499], ['.shop', 199],
]);
// Pre-sorted longest-first so multi-part TLDs (.com.pg) match before shorter ones (.com)
const FALLBACK_TLD_SUFFIXES = [...FALLBACK_TLD_PRICE_CENTS.keys()].sort((a, b) => b.length - a.length);

async function createDomainPaymentOrder(input = {}, user = {}) {
  const domains = Array.isArray(input.domains) ? input.domains : [];
  if (!domains.length) throw httpError('At least one domain is required.', 400);
  const normalized = domains.map((item) => ({
    name: cleanDomainName(item.name || item.hostname || item.domain),
    years: Math.min(Math.max(Number(item.years || 1), 1), 10),
  }));
  const availability = await checkSpaceshipAvailability(normalized.map((item) => item.name));
  const lines = normalized.map((item) => {
    const row = availability.domains.find((candidate) => candidate.domain === item.name);
    if (row && !row.available) throw httpError(`${item.name} is no longer available.`, 409);
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

async function captureDomainPaymentOrder(input = {}, user = {}) {
  const order = await getCheckoutOrder(input.checkoutOrderId);
  if (order.type !== 'domain_purchase') throw httpError('Checkout order is not for a domain purchase.', 400);
  if (order.status === 'paid') return order.result;

  const domains = order.metadata.domains || [];
  const providerOrderId = input.providerOrderId || input.orderId || order.providerOrderId;

  // Batch availability check BEFORE capturing payment to prevent money being taken for unavailable domains
  if (domains.length) {
    const availability = await checkSpaceshipAvailability(domains.map((d) => d.name));
    const unavailable = domains.filter((item) => {
      const row = availability.domains.find((r) => r.domain === item.name);
      return row && !row.available;
    });
    if (unavailable.length) throw httpError(`${unavailable.map((d) => d.name).join(', ')} is no longer available.`, 409);
  }

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

async function createHostingPaymentOrder(input = {}, user = {}) {
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

async function captureHostingPaymentOrder(input = {}, user = {}) {
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
    // Also stamp paymentStatus on the deployment record
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

async function createCheckoutOrder({ type, user, source, lineItems, metadata }) {
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

async function getCheckoutOrder(checkoutOrderId) {
  const id = String(checkoutOrderId || '').trim();
  if (!id) throw httpError('checkoutOrderId is required.', 400);
  const store = await readHostingStore();
  const order = (store.checkoutOrders || []).find((item) => item.id === id);
  if (!order) throw httpError('Checkout order not found.', 404);
  return order;
}

async function markCheckoutPaid(checkoutOrderId, providerCaptureId, result, user = {}) {
  return mutateHostingStore((store) => {
    const order = (store.checkoutOrders || []).find((item) => item.id === checkoutOrderId);
    if (!order) return result;
    if (order.status === 'paid') return order.result;
    Object.assign(order, {
      status: 'paid',
      providerCaptureId,
      result,
      updatedAt: nowIso(),
    });
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

async function refundPayPalCapture(captureId) {
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

async function createPayPalOrder({ checkoutOrderId, type, totalAmountCents, lineItems, amounts, returnUrl, cancelUrl }) {
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

async function capturePayPalOrder(providerOrderId) {
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

let paypalTokenCache = { token: '', expiresAt: 0 };
async function getPayPalAccessToken() {
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

async function paypalHeaders() {
  return {
    Authorization: `Bearer ${await getPayPalAccessToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function paypalBaseUrl() {
  return String(process.env.PAYPAL_SANDBOX || 'true').toLowerCase() === 'false'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function assertPayPalConfigured() {
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) return;
  throw httpError('PayPal credentials are not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.', 503);
}

function getPlatformMarkupPercent() {
  const raw = process.env.PLATFORM_MARKUP_PERCENT;
  if (raw === undefined || raw === '') return 30;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 30;
  return value;
}

function domainActualPriceCents(domain, availabilityRow) {
  const premium = availabilityRow?.pricing?.amount;
  if (premium != null && Number.isFinite(Number(premium))) return Math.max(0, Math.round(Number(premium)));
  const tld = FALLBACK_TLD_SUFFIXES.find((suffix) => domain.endsWith(suffix));
  if (!tld) throw httpError(`No registrar price is configured for ${domain}.`, 400);
  return FALLBACK_TLD_PRICE_CENTS.get(tld);
}

function hostingActualCostCents(input = {}) {
  const supplied = Number(input.actualAmountCents || input.hostingCostCents || 0);
  if (Number.isFinite(supplied) && supplied > 0) return Math.round(supplied);
  const plan = String(input.plan || 'starter').toLowerCase();
  if (plan === 'free') return 0;
  if (plan === 'standard') return 2500;
  if (plan === 'pro') return 8500;
  return 700;
}

function sanitizeContact(input = {}) {
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

function centsToUsd(cents) {
  return (Math.max(0, Math.round(Number(cents) || 0)) / 100).toFixed(2);
}

function safeReturnUrl(value) {
  const fallback = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
  try {
    const url = new URL(value || fallback);
    if (!['http:', 'https:'].includes(url.protocol)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

function httpError(message, status = 400, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  error.expose = true;
  return error;
}

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = isProd && !err.expose ? 'An unexpected error occurred.' : (err.message || String(err));
  console.error(`[error] ${req.method} ${req.url} →`, err.message || err);
  const body = {
    success: false,
    error: { code: err.code || 'INTERNAL_ERROR', message },
    requestId: req.id,
  };
  // Include stage field when present — used by deployment error responses
  if (err.stage) body.stage = err.stage;
  if (err.details && err.expose) body.details = err.details;
  res.status(status).json(body);
});

// ── Payment enforcement job ───────────────────────────────────────────────────
// Runs every 30 minutes. Only acts on deployments that were made through the
// Glondia platform (platformDeployed: true). Never scans Render directly —
// only reads from the local store. Never touches anything on startup.
function startPaymentEnforcementJob() {
  const GRACE_MS = Number(process.env.PAYMENT_GRACE_HOURS || 24) * 60 * 60 * 1000;
  const INTERVAL_MS = 30 * 60 * 1000;

  const runEnforcement = async () => {
    try {
      const store = await readHostingStore();
      const paidIds = new Set(
        (store.checkoutOrders || [])
          .filter((o) => o.type === 'hosting_deployment' && o.status === 'paid' && o.metadata?.deploymentId)
          .map((o) => o.metadata.deploymentId)
      );

      for (const dep of store.deployments || []) {
        // ONLY act on deployments made through this platform.
        // platformDeployed must be explicitly true — anything else is off-limits.
        if (dep.platformDeployed !== true) continue;
        if (dep.paymentStatus === 'paid' || dep.paymentStatus === 'overdue_suspended') continue;
        if (['not_billable_yet', 'billing_pending', 'billing_error'].includes(String(dep.paymentStatus || '').toLowerCase())) continue;
        if (['not_started', 'trial_pending'].includes(String(dep.subscriptionStatus || '').toLowerCase())) continue;
        if (!dep.checkoutOrderId) continue;
        if (paidIds.has(dep.deploymentId)) continue;
        if (!dep.createdAt) continue;
        if (Date.now() < new Date(dep.createdAt).getTime() + GRACE_MS) continue;

        // Grace period expired and no payment — suspend via Render
        if (dep.renderServiceId) {
          await renderApiService.suspendService(dep.renderServiceId).catch((err) => {
            console.error(`[enforcement] Suspend failed for ${dep.deploymentId}:`, err.message);
          });
        }
        await mutateHostingStore((s) => {
          const d = (s.deployments || []).find((x) => x.deploymentId === dep.deploymentId);
          if (d) { d.paymentStatus = 'overdue_suspended'; d.status = 'suspended'; d.updatedAt = nowIso(); }
        });
        console.log(`[enforcement] Suspended ${dep.serviceName || dep.deploymentId} — payment overdue.`);
      }
    } catch (err) {
      console.error('[enforcement] Job error:', err.message);
    }
  };

  // No immediate startup run — only fires on the interval.
  // This prevents touching anything when the server redeploys.
  return setInterval(runEnforcement, INTERVAL_MS);
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[glondia] API + static server listening on port ${PORT}`);
    console.log(`[glondia] Serving Vite app from ${distDir}`);
    console.log(`[glondia] DATABASE_URL: ${(process.env.DATABASE_URL || '(not set)').replace(/:[^:@]+@/, ':***@')}`);

    // Verify DB is reachable on startup — logs clearly if the file can't be opened.
    prisma.$connect()
      .then(() => console.log('[glondia] Database connection established.'))
      // Self-heal additive User columns + the notifications table so a DB that
      // predates a schema change doesn't 500 (push-based, no migrations).
      .then(() => ensureUserColumns())
      .then(() => ensureNotificationsTable())
      .then(() => ensureDeploymentSubscriptionsTable())
      .catch((err) => console.error('[glondia] Database connection FAILED:', err.message, '\n  Check that the persistent disk is mounted and DATABASE_URL is correct.'));
  });
  // Deploy-first tiered billing: enforce the 12-hour grace window every 5 minutes.
  startDeploymentCleanupJob();
  // Warm the forex cache so the first PayPal order creation doesn't cold-fetch.
  warmForexCache();
}

export default app;
