import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { requestId } from './middleware/request-id.middleware.js';
import { responseHelper } from './middleware/response.middleware.js';
import { requireFeature, featureFlagsHandler } from './middleware/featureFlag.js';
import { securityContext } from './middleware/securityContext.middleware.js';
import { slowRequestWarning } from './middleware/slowRequestWarning.middleware.js';
import { threatTag } from './middleware/threatTag.middleware.js';

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
import { customerTicketRouter } from './routes/tickets.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import emailRoutes from './routes/email.routes.js';
import providerRenderRoutes from './glondia-engines/01-HOSTING-DEPLOY-ENGINE/01-ROUTES/providerRender.routes.js';
import sandboxRoutes from './glondia-engines/01-HOSTING-DEPLOY-ENGINE/01-ROUTES/sandbox.routes.js';
import deploymentStreamRoutes from './glondia-engines/01-HOSTING-DEPLOY-ENGINE/01-ROUTES/deploymentStream.routes.js';
import paymentsProviderRoutes from './routes/payments-provider.routes.js';
import spaceshipRoutes from './routes/provider-spaceship.routes.js';
import { providerApiGuard } from './glondia-engines/01-HOSTING-DEPLOY-ENGINE/services/providerApiGuard.service.js';
import { verifyPaypalWebhook, handlePaypalWebhookEvent } from './services/paypalWebhookService.js';
import { startDeploymentCleanupJob } from './services/deploymentCleanupService.js';
import { warmForexCache } from './services/forexService.js';
import { prisma, ensureUserColumns, ensureNotificationsTable, ensureDeploymentSubscriptionsTable } from './services/db.js';
import { auditWrites } from './middleware/audit.middleware.js';
import renderApiService from './services/renderApiService.js';
import { mutateHostingStore, nowIso, readHostingStore } from './services/hostingStore.js';

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
app.use(securityContext);
app.use(slowRequestWarning);
app.use(threatTag);
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
// Generic frontend-facing registrar API (provider-agnostic path).
// Spaceship is the current implementation; swap the handler later without changing the client.
app.use('/api/registrar', requireFeature('DOMAINS'), spaceshipRoutes);
// Provider-specific alias kept for admin/tools and backwards compatibility.
app.use('/api/spaceship', requireFeature('DOMAINS'), spaceshipRoutes);

// ── Provider payment routes (PayPal client, domain+hosting checkout) ──────────
app.use('/api/payments', paymentsProviderRoutes);

// Sandbox preview routes (must come before SPA fallback)
app.use('/sandbox', sandboxRoutes);

// ── API routes ───────────────────────────────────────────────────────────────

// Public (unauthenticated)
app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/public/sites', publicSalesRoutes);
app.use('/api/v1/domains', requireFeature('DOMAINS'), domainPublicRoutes);
// Template catalog is part of the Site Builder surface. TEMPLATE_MARKETPLACE
// remains reserved for the future paid template store.
app.use('/api/v1/templates', requireFeature('SITE_BUILDER'), templateRoutes);
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
// deploymentStreamRoutes must come first so the SSE path is matched before the REST routes.
app.use('/api/deployments', deploymentStreamRoutes);
app.use('/api/deployments', deploymentRoutes);
app.use('/api/hosting', hostingRoutes);
app.use('/api/hosting', environmentRoutes);
app.use('/api/hosting', diskRoutes);
app.use('/api/hosting', requireFeature('DOMAINS'), domainHostingRoutes);

// Deploy-first tiered billing: customer payments + receipts, and the admin surface.
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/v1/tickets', customerTicketRouter);
// Business Email — client mailbox list + setup requests (MVP foundation).
app.use('/api/v1/email', requireFeature('EMAIL'), emailRoutes);
// User-facing notifications (Bell dropdown) — mounted on both API prefixes.
app.use('/api/notifications', notificationRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// ── Admin dashboard — served from admin-dashboard/frontend/ ──────────────────
const adminDashDir = join(rootDir, 'admin-dashboard', 'frontend');
if (existsSync(adminDashDir)) {
  // Static assets: /dashboard-assets/* → admin-dashboard/frontend/*
  app.use('/dashboard-assets', express.static(adminDashDir, {
    index: false,
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  // Dashboard shell: /dashboard and /dashboard/* → admin-dashboard/frontend/index.html
  app.get(['/dashboard', '/dashboard/*'], (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(join(adminDashDir, 'index.html')).pipe(res);
  });
}

// ── SPA fallback — serve Vite dist for everything else ──────────────────────
app.use((req, res) => serveStatic(req, res));

// Payment business logic → server/src/services/payments-provider.service.js
// SSE stream logic → server/src/glondia-engines/01-HOSTING-DEPLOY-ENGINE/services/deploymentStream.service.js


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
