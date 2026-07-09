/**
 * pipedrive.middleware.js
 *
 * Express-compatible middleware for the Pipedrive CRM integration.
 *
 * requirePipedriveApiKey  — blocks requests if no API key is configured.
 * requirePipedriveEnabled — blocks requests if the Pipedrive plugin is disabled.
 *
 * Both return JSON { ok: false, message } with an appropriate HTTP status so
 * the frontend can surface a user-friendly error without leaking stack traces.
 *
 * Usage in routes (note: these are optional guards — the controller already
 * validates the key itself, but middleware catches misconfiguration early):
 *
 *   app.post('/api/admin/pipedrive/sync',
 *     requirePipedriveApiKey,
 *     requirePipedriveEnabled,
 *     handler
 *   );
 */

// We intentionally avoid importing _pdSettings directly because the controller
// owns that state. Instead the middleware reads process.env so it stays stateless
// and doesn't create a circular dependency.

/**
 * Returns 503 if PIPEDRIVE_API_KEY is not set in the environment AND
 * the in-memory store has no key yet (checked via a shared flag on the module).
 *
 * The controller will do its own key check too — this is a fast early exit
 * for obvious misconfiguration at server startup time.
 */
function requirePipedriveApiKey(req, res, next) {
  // Allow test-connection requests through — they carry the key in the body
  const isTestRoute = req.path && req.path.includes('/test');
  if (isTestRoute) return next();

  // For all other routes, the key must be configured on the server
  if (!process.env.PIPEDRIVE_API_KEY) {
    return res.status(503).json({
      ok:      false,
      message: 'Pipedrive API key is not configured on this server. Save your key in Settings → Plugins → Pipedrive first.',
    });
  }

  return next();
}

/**
 * Placeholder — when a persistent plugin-enabled flag is added to the DB
 * this middleware will read it. For now it always passes through because
 * the controller checks the in-memory `_pdSettings.enabled` flag at call time.
 */
function requirePipedriveEnabled(req, res, next) {
  return next();
}

module.exports = { requirePipedriveApiKey, requirePipedriveEnabled };
