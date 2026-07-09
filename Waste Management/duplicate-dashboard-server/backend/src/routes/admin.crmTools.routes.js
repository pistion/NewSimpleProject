/**
 * admin.crmTools.routes.js
 *
 * Mounts all CRM AI + social integration routes:
 *
 *   POST  /api/admin/crm/ai-chat
 *   POST  /api/admin/crm/ai-chat/confirm
 *   GET   /api/admin/crm/ai-conversations
 *   POST  /api/admin/crm/ai-conversations
 *   GET   /api/admin/crm/ai-conversations/:uid
 *   PATCH /api/admin/crm/ai-conversations/:uid/archive
 *
 *   GET   /api/admin/crm/tools
 *   GET   /api/admin/crm/tools/status
 *
 *   POST  /api/admin/crm/integrations/:provider/auth      ← start OAuth
 *   GET   /api/admin/crm/integrations/:provider/callback  ← capture callback
 *   POST  /api/admin/crm/integrations/:provider/disconnect
 *   GET   /api/admin/crm/integrations/:provider/status
 */

const crypto      = require('crypto');
const { ok, err } = require('../http/api-response');
const orchestrator = require('../services/crm-ai/crmAiOrchestrator');
const { listTools } = require('../services/crm-tools/crmToolRegistry');
const facebook    = require('../services/social/facebookService');
const linkedin    = require('../services/social/linkedInService');

// ── CSRF state store for OAuth ────────────────────────────────────────────────
// state → { provider, returnTo, expiresAt }
const oauthStates = new Map();

function createOAuthState(provider, returnTo) {
  const state = crypto.randomUUID();
  oauthStates.set(state, { provider, returnTo: returnTo || '/dashboard/', expiresAt: Date.now() + 10 * 60 * 1000 });
  return state;
}

function consumeOAuthState(state) {
  const entry = oauthStates.get(state);
  if (!entry) return null;
  oauthStates.delete(state);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

function getProviderService(provider) {
  if (provider === 'facebook') return facebook;
  if (provider === 'linkedin') return linkedin;
  return null;
}

// ── Route handlers ────────────────────────────────────────────────────────────

// POST /api/admin/crm/ai-chat
async function aiChat(req, res) {
  try {
    const result = await orchestrator.runCrmAiChat(req.body || {});
    return res.status(result.status || 200).json(result);
  } catch (e) {
    console.error('[CRM AI Chat]', e);
    return res.status(500).json({ ok: false, content: e.message, type: 'error' });
  }
}

// POST /api/admin/crm/ai-chat/confirm
async function aiChatConfirm(req, res) {
  try {
    const result = await orchestrator.confirmCrmAiAction(req.body || {});
    return res.status(result.status || 200).json(result);
  } catch (e) {
    return res.status(500).json({ ok: false, content: e.message, type: 'error' });
  }
}

// GET /api/admin/crm/ai-conversations
function listConversations(req, res) {
  const limit    = Number(req.query?.limit) || 25;
  const archived = req.query?.archived === 'true';
  return ok(res, { conversations: orchestrator.listConversations({ limit, archived }) });
}

// POST /api/admin/crm/ai-conversations
function createConversation(req, res) {
  const conv = orchestrator.createConversation(req.body || {});
  return ok(res, { conversation: conv });
}

// GET /api/admin/crm/ai-conversations/:uid
function getConversation(req, res) {
  const conv = orchestrator.getConversation(req.params?.uid);
  if (!conv) return res.status(404).json({ ok: false, message: 'Conversation not found' });
  return ok(res, { conversation: conv });
}

// PATCH /api/admin/crm/ai-conversations/:uid/archive
function archiveConversation(req, res) {
  const conv = orchestrator.archiveConversation(req.params?.uid);
  if (!conv) return res.status(404).json({ ok: false, message: 'Conversation not found' });
  return ok(res, { conversation: conv });
}

// GET /api/admin/crm/tools
function getTools(_req, res) {
  return ok(res, { tools: listTools() });
}

// GET /api/admin/crm/tools/status
function getToolStatus(_req, res) {
  const fb  = facebook.getStatus();
  const li  = linkedin.getStatus();
  return ok(res, {
    status: {
      email: {
        provider:   'email',
        connected:  true,
        configured: Boolean(process.env.SENDGRID_API_KEY && !process.env.SENDGRID_API_KEY.startsWith('replace')),
      },
      facebook: { provider: 'facebook', ...fb },
      linkedin:  { provider: 'linkedin', ...li },
    },
  });
}

// POST /api/admin/crm/integrations/:provider/auth
function startSocialAuth(req, res) {
  const provider = req.params?.provider;
  const service  = getProviderService(provider);
  if (!service) return res.status(400).json({ ok: false, message: `Unknown provider: ${provider}` });

  const returnTo = req.body?.returnTo || '/dashboard/#crm';
  const state    = createOAuthState(provider, returnTo);
  const authUrl  = service.getAuthUrl(state);

  return ok(res, { authUrl, provider });
}

// GET /api/admin/crm/integrations/:provider/callback
async function socialCallback(req, res) {
  const provider = req.params?.provider;
  const service  = getProviderService(provider);

  const code  = req.query?.code;
  const state = req.query?.state;
  const error = req.query?.error;

  // Build a safe fallback redirect
  const fallback = '/dashboard/#crm';

  if (!service) {
    return res.redirect(`${fallback}?social=${provider}&status=error&reason=unknown_provider`);
  }

  if (error) {
    const reason = encodeURIComponent(req.query?.error_description || error);
    return res.redirect(`${fallback}?social=${provider}&status=error&reason=${reason}`);
  }

  if (!code) {
    return res.redirect(`${fallback}?social=${provider}&status=error&reason=no_code`);
  }

  // Validate CSRF state
  const stateEntry = state ? consumeOAuthState(state) : null;
  const returnTo   = stateEntry?.returnTo || fallback;

  try {
    await service.handleCallback(code);
    const separator = returnTo.includes('?') ? '&' : '?';
    return res.redirect(`${returnTo}${separator}social=${provider}&status=connected`);
  } catch (e) {
    console.error(`[OAuth Callback][${provider}]`, e.message);
    const reason = encodeURIComponent(e.message.slice(0, 120));
    return res.redirect(`${fallback}?social=${provider}&status=error&reason=${reason}`);
  }
}

// POST /api/admin/crm/integrations/:provider/disconnect
function disconnectSocial(req, res) {
  const provider = req.params?.provider;
  const service  = getProviderService(provider);
  if (!service) return res.status(400).json({ ok: false, message: `Unknown provider: ${provider}` });
  service.disconnect();
  return ok(res, { disconnected: true, provider });
}

// GET /api/admin/crm/integrations/:provider/status
function getSocialStatus(req, res) {
  const provider = req.params?.provider;
  const service  = getProviderService(provider);
  if (!service) return res.status(400).json({ ok: false, message: `Unknown provider: ${provider}` });
  return ok(res, { status: service.getStatus() });
}

// ── Route registration ────────────────────────────────────────────────────────

function createCrmToolRoutes() {
  return [
    { method: 'POST',  path: '/api/admin/crm/ai-chat',                                handler: aiChat },
    { method: 'POST',  path: '/api/admin/crm/ai-chat/confirm',                        handler: aiChatConfirm },
    { method: 'GET',   path: '/api/admin/crm/ai-conversations',                       handler: listConversations },
    { method: 'POST',  path: '/api/admin/crm/ai-conversations',                       handler: createConversation },
    { method: 'GET',   path: '/api/admin/crm/ai-conversations/:uid',                  handler: getConversation },
    { method: 'PATCH', path: '/api/admin/crm/ai-conversations/:uid/archive',          handler: archiveConversation },
    { method: 'GET',   path: '/api/admin/crm/tools',                                  handler: getTools },
    { method: 'GET',   path: '/api/admin/crm/tools/status',                           handler: getToolStatus },
    { method: 'POST',  path: '/api/admin/crm/integrations/:provider/auth',            handler: startSocialAuth },
    { method: 'GET',   path: '/api/admin/crm/integrations/:provider/callback',        handler: socialCallback },
    { method: 'POST',  path: '/api/admin/crm/integrations/:provider/disconnect',      handler: disconnectSocial },
    { method: 'GET',   path: '/api/admin/crm/integrations/:provider/status',          handler: getSocialStatus },
  ];
}

function registerCrmToolRoutes(app) {
  const { asHttpHandler } = require('../http/api-response');
  createCrmToolRoutes().forEach((route) => {
    // callback uses a raw res.redirect — register without asHttpHandler wrapper
    if (route.handler === socialCallback) {
      app[route.method.toLowerCase()](route.path, (req, res) => socialCallback(req, res));
    } else {
      app[route.method.toLowerCase()](route.path, asHttpHandler(route.handler));
    }
  });
  return app;
}

module.exports = { createCrmToolRoutes, registerCrmToolRoutes };
